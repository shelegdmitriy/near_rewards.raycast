import type { BlockResult, EpochValidatorInfo } from "@near-js/types";
import { NearRewardsClient, getNearAmount } from "./near-api-client";
import { AccountBalancesAtBlock, AccountData } from "./types";

export class NearRewardsService {
  private client: NearRewardsClient;

  constructor(rpcEndpoint?: string) {
    this.client = new NearRewardsClient(rpcEndpoint);
  }

  async getEpochInfo(): Promise<{ epochInfo: EpochValidatorInfo; currentBlock: BlockResult }> {
    const [currentBlock, validators] = await Promise.all([
      this.client.getFinalBlock(),
      this.client.getValidators()
    ]);

    return {
      epochInfo: validators,
      currentBlock: currentBlock,
    };
  }

  async collectAccountData(accountId: string, providedStakingPool?: string, blockHeight?: number): Promise<AccountBalancesAtBlock> {
    let poolAccountId: string | null = providedStakingPool || null;
    const blockInfo = blockHeight ? ` at block ${blockHeight}` : "";
    console.log(`Collecting data for account: ${accountId} and pool: ${poolAccountId || "none"}${blockInfo}`);

    if (!poolAccountId) {
      console.log(`No staking pool provided, checking if ${accountId} is a lockup account`);
      try {
        poolAccountId = await this.client.getStakingPoolAccountId(accountId);
        console.log(`if Using staking pool: ${poolAccountId || "none"}`);
      } catch {
        console.log(`Account ${accountId} is not a lockup account, checking for direct staking`);
      }
    }

    // Get native balance (at specific block if provided)
    const nativeBalance = await this.client.getNativeBalance(accountId, blockHeight);
    console.log(`Native balance for ${accountId}${blockInfo}: ${nativeBalance} yoctoNEAR`);

    // Only get account state for current data (not historical)
    if (!blockHeight) {
      const state = await this.client.getAccountState(accountId);
      console.log(`Account state for ${accountId}:`, state);
    }

    let accountInPool = null;
    let stakedBalance = BigInt(0);
    let unstakedBalance = BigInt(0);
    let canWithdraw = false;

    console.log(`Using staking pool: ${poolAccountId || "none"}`);

    // If we found a pool, get staking information
    if (poolAccountId) {
      accountInPool = await this.client.getAccountInPool(accountId, poolAccountId);
      console.log(`Account in pool data for ${accountId} in ${poolAccountId}${blockInfo}:`, accountInPool);
      if (accountInPool) {
        console.log(`Raw staked_balance: "${accountInPool.staked_balance}"`);
        console.log(`Raw unstaked_balance: "${accountInPool.unstaked_balance}"`);

        try {
          // const stakedBalanceStr = accountInPool.staked_balance.replace(/^"|"$/g, "");
          stakedBalance = BigInt(accountInPool.staked_balance);
          console.log(`Parsed staked balance: ${stakedBalance} yoctoNEAR`);
        } catch (error) {
          console.error(`Error parsing staked balance: "${accountInPool.staked_balance}"`, error);
          stakedBalance = BigInt(0);
        }
        try {
          unstakedBalance = BigInt(accountInPool.unstaked_balance);
          console.log(`Parsed unstaked balance: ${unstakedBalance} yoctoNEAR`);
        } catch (error) {
          console.error(`Error parsing unstaked balance: "${accountInPool.unstaked_balance}"`, error);
          unstakedBalance = BigInt(0);
        }
        canWithdraw = accountInPool.can_withdraw;
      }
    }

    // Only check contract methods for current data (not historical)
    let lockedAmount: bigint = BigInt(0);
    let liquidBalance: bigint = BigInt(0);

    if (!blockHeight) {
      // Check if this is a contract account before trying lockup methods
      const isContract = await this.client.isContract(accountId);
      console.log(`Account ${accountId} is ${isContract ? "" : "not "}a contract`);

      // Try to get locked amount (only for lockup contract accounts)
      if (isContract) {
        try {
          lockedAmount = await this.client.getLockedAmount(accountId);
          console.log(`Locked amount for ${accountId}: ${lockedAmount} yoctoNEAR`);
        } catch {
          // Even contracts might not have this method
        }
      }

      // Try to get liquid balance (only for lockup contract accounts)
      if (isContract) {
        try {
          liquidBalance = await this.client.getLiquidOwnersBalance(accountId);
        } catch {
          // Even contracts might not have this method
        }
      }
    }

    // Calculate rewards (total staked + unstaked + native if locked - locked amount)
    const reward = stakedBalance + unstakedBalance + (lockedAmount > 0 ? nativeBalance : BigInt(0)) - lockedAmount;

    console.log(`Calculated reward for ${accountId}: ${reward} yoctoNEAR`);

    return {
      account_in_pool: accountInPool,
      native_balance: nativeBalance,
      liquid_balance: liquidBalance > 0 ? liquidBalance : nativeBalance,
      staked_balance: stakedBalance,
      unstaked_balance: unstakedBalance,
      locked_amount: lockedAmount,
      reward: reward > 0 ? reward : BigInt(0),
      can_withdraw: canWithdraw,
      pool_account_id: poolAccountId || undefined,
    };
  }

  async getAccountRewardsData(accountId: string, stakingPool?: string): Promise<AccountData> {
    const { epochInfo, currentBlock } = await this.getEpochInfo();

    // Get current block data
    const currentData = await this.collectAccountData(accountId, stakingPool);

    // Try to get previous epoch data for comparison (simplified for now)
    let prevEpochData: AccountBalancesAtBlock | undefined;
    let rewardDiff: bigint | undefined;

    try {
      // Calculate previous epoch block height (go back a few blocks from epoch start)
      const prevBlockHeight = epochInfo.epoch_start_height - 6;
      console.log(`Fetching previous epoch data at block ${prevBlockHeight}`);

      // Get historical account data - but only if we have a staking pool
      if (currentData.pool_account_id) {
        try {
          prevEpochData = await this.collectAccountData(
            accountId,
            currentData.pool_account_id,
            prevBlockHeight
          );

          if (prevEpochData) {
            rewardDiff = currentData.reward - prevEpochData.reward;
            console.log(`Reward difference: ${rewardDiff} yoctoNEAR (current: ${currentData.reward}, previous: ${prevEpochData.reward})`);
          }
        } catch {
          console.warn("Failed to fetch historical data, falling back to estimation");

          // Fallback: estimate based on current epoch progress
          const blocksIntoEpoch = currentBlock.header.height - epochInfo.epoch_start_height;
          if (blocksIntoEpoch > 100 && currentData.staked_balance > 0) {
            // Estimate rewards based on staking progress through epoch
            const epochProgress = blocksIntoEpoch / 43200; // 43200 blocks per epoch
            // Rough estimate: ~5% APY = ~0.01% per epoch for rewards
            const estimatedEpochRewards = currentData.staked_balance * BigInt(Math.floor(epochProgress * 10)) / BigInt(100000);
            rewardDiff = estimatedEpochRewards;
            console.log(`Estimated reward difference: ${rewardDiff} yoctoNEAR (${(epochProgress * 100).toFixed(1)}% through epoch)`);
          }
        }
      }
    } catch (error) {
      console.warn("Could not calculate reward difference:", error);
    }

    return {
      account_id: accountId,
      pool_account_id: currentData.pool_account_id,
      current_data: currentData,
      prev_epoch_data: prevEpochData,
      reward_diff: rewardDiff,
      epoch_info: { epochInfo, currentBlock },
    };
  }

  formatRewardDiff(rewardDiff: bigint): { text: string; isPositive: boolean } {
    const diff = getNearAmount(rewardDiff);
    const isPositive = rewardDiff > 0;
    const prefix = isPositive ? "+" : "";
    return {
      text: `${prefix}${diff.toFixed(2)}`,
      isPositive,
    };
  }

  // Helper method to check if account exists and is valid
  async validateAccount(accountId: string): Promise<boolean> {
    try {
      await this.client.getNativeBalance(accountId);
      return true;
    } catch {
      return false;
    }
  }
}

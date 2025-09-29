import { Action, ActionPanel, List, showToast, Toast, Icon, Color } from "@raycast/api";
import { useState, useEffect } from "react";
import { Account } from "@near-js/accounts";
import { USDT, USDC } from "@near-js/tokens/mainnet";
import type { AccountData, PriceInfo } from "./types";
import { NearRewardsService } from "./rewards-service";
import { formatNearAmount } from "@near-js/utils";
import { getNearAmount, fetchNearPrice, calculateCurrentPositionInEpoch } from "./near-api-client";

interface DetailedAccountViewProps {
  accountId: string;
  stakingPool?: string;
  onSaveAccount: (accountId: string, stakingPool?: string) => void;
}

export function DetailedAccountView({ accountId, stakingPool, onSaveAccount }: DetailedAccountViewProps) {
  const [accountData, setAccountData] = useState<AccountData | null>(null);
  const [epochInfo, setEpochInfo] = useState<AccountData['epoch_info'] | null>(null);
  const [priceInfo, setPriceInfo] = useState<PriceInfo | null>(null);
  const [nativeBalance, setNativeBalance] = useState<string>("0");
  const [usdtBalance, setUsdtBalance] = useState<string>("0");
  const [usdcBalance, setUsdcBalance] = useState<string>("0");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchAccountData();
  }, [accountId, stakingPool]);

  async function fetchAccountData() {
    setIsLoading(true);
    try {
      const service = new NearRewardsService();

      // Validate account first
      const isValid = await service.validateAccount(accountId);
      if (!isValid) {
        showToast({
          style: Toast.Style.Failure,
          title: "Account Not Found",
          message: `The account "${accountId}" does not exist on NEAR Protocol`,
        });
        setIsLoading(false);
        return;
      }

      if (!stakingPool) {
        // Auto-detect mode - try to fetch full data (will auto-detect lockup contracts)
        const [accountRewardsData, price] = await Promise.all([
          service.getAccountRewardsData(accountId, stakingPool),
          fetchNearPrice(),
        ]);

        setAccountData(accountRewardsData);
        setEpochInfo(accountRewardsData.epoch_info || null);
        setPriceInfo({ near_usd: price, timestamp: Date.now() });

        // If it's a basic account (no staking pool found), also set native balance for display
        if (!accountRewardsData.current_data.pool_account_id) {
          setNativeBalance(formatNearAmount(accountRewardsData.current_data.native_balance.toString()));
        } else {
          // If we found a staking pool, also fetch token balances
          const account = new Account(accountId, service['client']['provider']);
          const [usdtBal, usdcBal] = await Promise.all([
            account.getBalance(USDT).catch(() => BigInt(0)),
            account.getBalance(USDC).catch(() => BigInt(0)),
          ]);
          setUsdtBalance(USDT.toDecimal(usdtBal));
          setUsdcBalance(USDC.toDecimal(usdcBal));
        }
      } else {
        // Full mode - fetch all staking data
        const account = new Account(accountId, service['client']['provider']);

        const [accountRewardsData, price, usdtBal, usdcBal] = await Promise.all([
          service.getAccountRewardsData(accountId, stakingPool),
          fetchNearPrice(),
          account.getBalance(USDT).catch(() => BigInt(0)),
          account.getBalance(USDC).catch(() => BigInt(0)),
        ]);

        setAccountData(accountRewardsData);
        setEpochInfo(accountRewardsData.epoch_info || null);
        setPriceInfo({ near_usd: price, timestamp: Date.now() });
        setUsdtBalance(USDT.toDecimal(usdtBal));
        setUsdcBalance(USDC.toDecimal(usdcBal));
      }
    } catch (error) {
      console.error("Error fetching detailed account data:", error);
      showToast({
        style: Toast.Style.Failure,
        title: "Error",
        message: error instanceof Error ? error.message : "Failed to fetch account data",
      });
    } finally {
      setIsLoading(false);
    }
  }

  // Simple USD formatting function
  function formatUSD(nearAmount: number, nearPrice: number): string {
    const usdValue = nearAmount * nearPrice;
    return `$${usdValue.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  function getItemActions(itemTitle: string, itemValue: string) {
    return (
      <ActionPanel>
        <Action.CopyToClipboard
          title={`Copy ${itemTitle}`}
          content={itemValue}
          shortcut={{ modifiers: ["cmd"], key: "c" }}
        />
        <Action.CopyToClipboard
          title="Copy Account ID"
          content={accountId}
          shortcut={{ modifiers: ["cmd", "shift"], key: "a" }}
        />
        <Action
          title="Save Account"
          onAction={() => onSaveAccount(accountId, stakingPool)}
          shortcut={{ modifiers: ["cmd"], key: "s" }}
        />
        <Action title="Refresh Data" onAction={fetchAccountData} shortcut={{ modifiers: ["cmd"], key: "r" }} />
      </ActionPanel>
    );
  }

  return (
    <List
      isLoading={isLoading}
      navigationTitle={`NEAR Account: ${accountId}`}
      searchBarPlaceholder="Search account data..."
    >
      {epochInfo && priceInfo && (
        <>
          <List.Section title="💰 Balance Information">
            <List.Item
              title="Native Balance"
              subtitle={accountData
                ? `${formatNearAmount(accountData.current_data.native_balance.toString())} NEAR`
                : `${nativeBalance} NEAR`
              }
              accessories={[
                {
                  text: accountData
                    ? `≈${formatUSD(getNearAmount(accountData.current_data.native_balance), priceInfo.near_usd)}`
                    : `≈${formatUSD(parseFloat(nativeBalance), priceInfo.near_usd)}`,
                  icon: Icon.BankNote
                }
              ]}
              icon={{ source: Icon.Coins, tintColor: Color.Yellow }}
              actions={getItemActions("Native Balance", accountData
                ? `${formatNearAmount(accountData.current_data.native_balance.toString())} NEAR`
                : `${nativeBalance} NEAR`
              )}
            />
            {accountData && accountData.current_data.pool_account_id && (
              <List.Item
                title="Liquid Balance"
                subtitle={`${formatNearAmount(accountData.current_data.liquid_balance.toString())} NEAR`}
                accessories={[
                  {
                    text: `≈${formatUSD(getNearAmount(accountData.current_data.liquid_balance), priceInfo.near_usd)}`,
                    icon: Icon.BankNote
                  }
                ]}
                icon={{ source: Icon.CircleFilled, tintColor: Color.Blue }}
                actions={getItemActions("Liquid Balance", `${formatNearAmount(accountData.current_data.liquid_balance.toString())} NEAR`)}
              />
            )}
          </List.Section>

          {accountData && accountData.current_data.pool_account_id && (parseFloat(usdtBalance) > 0 || parseFloat(usdcBalance) > 0) && (
            <List.Section title="🪙 Token Balances">
              {parseFloat(usdtBalance) > 0 && (
                <List.Item
                  title="USDT"
                  subtitle={`${usdtBalance} USDt`}
                  accessories={[{ text: "Tether USD", icon: Icon.BankNote }]}
                  icon={{ source: Icon.CircleFilled, tintColor: Color.Green }}
                  actions={getItemActions("USDT Balance", `${usdtBalance} USDt`)}
                />
              )}
              {parseFloat(usdcBalance) > 0 && (
                <List.Item
                  title="USDC"
                  subtitle={`${usdcBalance} USDC`}
                  accessories={[{ text: "USD Coin", icon: Icon.BankNote }]}
                  icon={{ source: Icon.CircleFilled, tintColor: Color.Blue }}
                  actions={getItemActions("USDC Balance", `${usdcBalance} USDC`)}
                />
              )}
            </List.Section>
          )}

          <List.Section title="ℹ️ Epoch Information">
            <List.Item
              title="Current Block"
              subtitle={epochInfo.currentBlock.header.height.toLocaleString()}
              accessories={[{ text: "Block Height", icon: Icon.Layers }]}
              icon={{ source: Icon.CodeBlock, tintColor: Color.Blue }}
              actions={getItemActions("Current Block Height", epochInfo.currentBlock.header.height.toString())}
            />
            <List.Item
              title="Epoch Start"
              subtitle={epochInfo.epochInfo.epoch_start_height.toLocaleString()}
              accessories={[{ text: "Start Block", icon: Icon.Calendar }]}
              icon={{ source: Icon.Clock, tintColor: Color.Purple }}
              actions={getItemActions("Epoch Start Block", epochInfo.epochInfo.epoch_start_height.toString())}
            />
            <List.Item
              title="Epoch Progress"
              subtitle={(() => {
                const progress = calculateCurrentPositionInEpoch(
                  epochInfo.epochInfo.epoch_start_height,
                  epochInfo.currentBlock.header.height
                );
                // Create a visual progress bar using Unicode characters
                const barLength = 10;
                const filledBars = Math.floor((progress / 100) * barLength);
                const emptyBars = barLength - filledBars;
                const progressBar = '█'.repeat(filledBars) + '░'.repeat(emptyBars);

                return `${progress}% ${progressBar}`;
              })()}
              accessories={[
                {
                  text: `${(epochInfo.currentBlock.header.height - epochInfo.epochInfo.epoch_start_height).toLocaleString()} / 43,200 blocks`,
                  icon: Icon.BarChart
                }
              ]}
              icon={{ source: Icon.CircleProgress, tintColor: Color.Green }}
            />
          </List.Section>

          <List.Section title="💹 Market Information">
            <List.Item
              title="NEAR Price"
              subtitle={`$${priceInfo.near_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} USD`}
              accessories={[
                {
                  text: `Updated: ${new Date(priceInfo.timestamp).toLocaleString()}`,
                  icon: Icon.Clock
                }
              ]}
              icon={{ source: Icon.BankNote, tintColor: Color.Green }}
              actions={getItemActions("NEAR Price", `$${priceInfo.near_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} USD`)}
            />
          </List.Section>

          {accountData && accountData.current_data.pool_account_id && (
            <>
              <List.Section title="🥇 Staking Information">
                <List.Item
                  title="Staked Balance"
                  subtitle={`${formatNearAmount(accountData.current_data.staked_balance.toString())} NEAR`}
                  accessories={[
                    {
                      text: `≈${formatUSD(getNearAmount(accountData.current_data.staked_balance), priceInfo.near_usd)}`,
                      icon: Icon.BankNote
                    }
                  ]}
                  icon={{ source: Icon.Lock, tintColor: Color.Orange }}
                  actions={getItemActions("Staked Balance", `${formatNearAmount(accountData.current_data.staked_balance.toString())} NEAR`)}
                />
                <List.Item
                  title="Unstaked Balance"
                  subtitle={`${formatNearAmount(accountData.current_data.unstaked_balance.toString())} NEAR`}
                  accessories={[
                    {
                      text: `≈${formatUSD(getNearAmount(accountData.current_data.unstaked_balance), priceInfo.near_usd)}`,
                      icon: Icon.BankNote
                    }
                  ]}
                  icon={{ source: Icon.LockUnlocked, tintColor: Color.Red }}
                  actions={getItemActions("Unstaked Balance", `${formatNearAmount(accountData.current_data.unstaked_balance.toString())} NEAR`)}
                />
                {accountData.current_data.pool_account_id && (
                  <List.Item
                    title="Pool Account"
                    subtitle={accountData.current_data.pool_account_id}
                    accessories={[{ text: "Staking Pool", icon: Icon.Building }]}
                    icon={{ source: Icon.Network, tintColor: Color.Purple }}
                    actions={getItemActions("Pool Account", accountData.current_data.pool_account_id)}
                  />
                )}
                <List.Item
                  title="Can Withdraw"
                  subtitle={accountData.current_data.can_withdraw ? "Yes" : "No (unstaking in progress)"}
                  accessories={[
                    {
                      text: accountData.current_data.can_withdraw ? "Ready" : "Pending",
                      icon: accountData.current_data.can_withdraw ? Icon.CheckCircle : Icon.Clock
                    }
                  ]}
                  icon={{
                    source: accountData.current_data.can_withdraw ? Icon.CheckCircle : Icon.Clock,
                    tintColor: accountData.current_data.can_withdraw ? Color.Green : Color.Orange
                  }}
                  actions={getItemActions("Can Withdraw", accountData.current_data.can_withdraw ? "Yes" : "No (unstaking in progress)")}
                />
              </List.Section>

              <List.Section title="🎁 Rewards">
                <List.Item
                  title="Total Rewards"
                  subtitle={`${formatNearAmount(accountData.current_data.reward.toString())} NEAR`}
                  accessories={[
                    {
                      text: `≈${formatUSD(getNearAmount(accountData.current_data.reward), priceInfo.near_usd)}`,
                      icon: Icon.BankNote
                    }
                  ]}
                  icon={{ source: Icon.Gift, tintColor: Color.Magenta }}
                  actions={getItemActions("Total Rewards", `${formatNearAmount(accountData.current_data.reward.toString())} NEAR`)}
                />
                {accountData.reward_diff !== undefined && (
                  <List.Item
                    title="This Epoch Reward"
                    subtitle={(() => {
                      const service = new NearRewardsService();
                      const formattedDiff = service.formatRewardDiff(accountData.reward_diff);
                      return `${formattedDiff.isPositive ? "+" : ""}${formattedDiff.text} NEAR`;
                    })()}
                    accessories={[
                      {
                        text: (() => {
                          const service = new NearRewardsService();
                          const formattedDiff = service.formatRewardDiff(accountData.reward_diff);
                          const diffAmount = parseFloat(formattedDiff.text.replace("+", "").replace(",", ""));
                          const diffUSD = formatUSD(diffAmount, priceInfo.near_usd);
                          return `≈${formattedDiff.isPositive ? "+" : ""}${diffUSD}`;
                        })(),
                        icon: (() => {
                          const service = new NearRewardsService();
                          const formattedDiff = service.formatRewardDiff(accountData.reward_diff);
                          return formattedDiff.isPositive ? Icon.ArrowUp : Icon.ArrowDown;
                        })()
                      }
                    ]}
                    icon={{
                      source: (() => {
                        const service = new NearRewardsService();
                        const formattedDiff = service.formatRewardDiff(accountData.reward_diff);
                        return formattedDiff.isPositive ? Icon.ArrowUp : Icon.ArrowDown;
                      })(),
                      tintColor: (() => {
                        const service = new NearRewardsService();
                        const formattedDiff = service.formatRewardDiff(accountData.reward_diff);
                        return formattedDiff.isPositive ? Color.Green : Color.Red;
                      })()
                    }}
                    actions={getItemActions("This Epoch Reward", (() => {
                      const service = new NearRewardsService();
                      const formattedDiff = service.formatRewardDiff(accountData.reward_diff);
                      return `${formattedDiff.isPositive ? "+" : ""}${formattedDiff.text} NEAR`;
                    })())}
                  />
                )}
              </List.Section>

              {accountData.current_data.locked_amount > 0 && (
                <List.Section title="🔒 Lockup Information">
                  <List.Item
                    title="Locked Amount"
                    subtitle={`${formatNearAmount(accountData.current_data.locked_amount.toString())} NEAR`}
                    accessories={[{ text: "Lockup Account", icon: Icon.Lock }]}
                    icon={{ source: Icon.LockDisabled, tintColor: Color.Red }}
                    actions={getItemActions("Locked Amount", `${formatNearAmount(accountData.current_data.locked_amount.toString())} NEAR`)}
                  />
                </List.Section>
              )}
            </>
          )}
        </>
      )}
    </List>
  );
}

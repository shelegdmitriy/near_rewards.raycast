# NEAR Rewards - Raycast Extension

A comprehensive Raycast extension for monitoring NEAR Protocol accounts, including balances, staking rewards, lockup contracts, and historical data comparison.

## Features

### 🔍 **Comprehensive Account Information**
- **Native Balance**: View your NEAR account's native balance with USD conversion
- **Staking Data**: Check staked, unstaked, and reward balances from staking pools
- **Lockup Contracts**: Monitor locked amounts and liquid balances for lockup accounts
- **Historical Comparison**: Track reward changes by comparing current data with previous epochs

### 💰 **Real-time USD Conversion**
- Live NEAR price fetching from Binance API
- USD value display for all balance types
- Formatted currency display with proper localization

### 📊 **Advanced Staking Insights**
- Staking pool information and status
- Reward tracking with historical comparison
- Epoch progress monitoring
- Validator information access

### 🔧 **Technical Features**
- Support for both regular and lockup contract accounts
- Failover RPC provider setup for reliability
- Precise balance calculations using BigInt
- Error handling for contract method calls

## Installation

1. Install [Raycast](https://raycast.com/) on your macOS or Windows device
2. Install the NEAR Rewards extension from the [Raycast Store](https://raycast.com/store)
3. Launch the extension using `cmd + space` and search for "Near Rewards"

## Usage

1. **Launch Extension**: Open Raycast and search for "Near Rewards"
2. **Enter Account ID**: Input any NEAR account ID (e.g., `alice.near`, `contract.lockup.near`)
3. **View Results**: Browse comprehensive account information including:
   - Native balance with USD value
   - Liquid balance (for lockup contracts)
   - Staked balance and rewards
   - Unstaked balance
   - Locked amounts (for lockup contracts)
   - Historical reward comparison

### Account Types Supported

- **Regular Accounts**: Standard NEAR accounts with native balance
- **Lockup Contracts**: Accounts with locked funds and staking delegation
- **Staking Pool Accounts**: Validator pool accounts with delegation info

## API Reference

### Core Classes

#### `NearRewardsClient`
Main client for interacting with NEAR blockchain:

```typescript
// Initialize client with failover RPC providers
const client = new NearRewardsClient();

// Get native balance (supports historical queries)
const balance = await client.getNativeBalance(accountId, blockHeight?);

// Check if account is a contract
const isContract = await client.isContract(accountId);

// Get lockup contract information
const lockedAmount = await client.getLockedAmount(accountId);
const liquidBalance = await client.getLiquidOwnersBalance(accountId);
```

### Utility Functions

#### Balance Formatting
```typescript
// Convert yoctoNEAR to NEAR (rounded to 2 decimals)
const nearAmount = getNearAmount(yoctoBalance);

// Format USD values
const usdValue = formatUSD(nearAmount, nearPrice);
```

#### Price & Epoch Information
```typescript
// Get current NEAR price
const price = await fetchNearPrice();

// Calculate epoch progress
const progress = calculateCurrentPositionInEpoch(epochStart, currentHeight);
```

## Technical Architecture

### Dependencies
- **@near-js/accounts**: Account management and balance queries
- **@near-js/providers**: RPC provider with failover support
- **@near-js/utils**: Official NEAR formatting utilities
- **@near-js/types**: TypeScript type definitions
- **@raycast/api**: Raycast extension framework

### RPC Endpoints
The extension uses multiple RPC endpoints for reliability:
- `https://free.rpc.fastnear.com` (Primary)
- `https://rpc.mainnet.near.org` (Fallback)
- `https://1rpc.io/near` (Fallback)
- `https://near.lava.build` (Fallback)

### Error Handling
- Graceful handling of contract method calls on regular accounts
- Automatic fallback between RPC providers
- User-friendly error messages for invalid accounts

## Development

### Prerequisites
- Node.js 18+
- TypeScript
- Raycast CLI

### Setup
```bash
# Clone the repository
git clone <repository-url>
cd near-rewards

# Install dependencies
npm install

# Start development mode
npm run dev

# Build for production
npm run build

# Lint and format
npm run lint
npm run fix-lint
```

### Project Structure
```
src/
├── near-api-client.ts      # Core NEAR blockchain client
├── rewards-service.ts      # Service layer for data collection
├── DetailedAccountView.tsx # Main UI component
├── near-rewards.tsx        # Entry point and account input
└── types.ts               # TypeScript interfaces
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

For issues, feature requests, or questions:
- Create an issue on GitHub
- Contact: [dmytro_sheleh](https://raycast.com/dmytro_sheleh)

## Acknowledgments

- Built with [NEAR JavaScript SDK](https://github.com/near/near-api-js)
- Powered by [Raycast](https://raycast.com/)
- Price data from [Binance API](https://binance-docs.github.io/apidocs/)

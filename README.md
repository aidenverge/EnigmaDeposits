# EnigmaDeposits

Confidential crowdfunding built on Zama FHEVM. EnigmaDeposits lets a fundraiser owner configure a campaign, accept cUSDT pledges with encrypted amounts, and later close the round to withdraw all funds—while contributors keep their individual amounts private on-chain.

## Overview
- **What it is**: A full-stack reference dapp that pairs FHE-enabled Solidity contracts with a React/Vite UI. Contributions are kept encrypted end-to-end using Zama's confidential stack.
- **Core contracts**: `ConfidentialUSDT` (ERC-7984-compatible confidential token) and `EnigmaFundraising` (privacy-preserving fundraiser logic).
- **User experience**: Contributors mint cUSDT for testing, authorize the fundraiser as an operator, encrypt their pledge locally, and submit it. The owner can decrypt aggregated totals and end the campaign at any time to receive all raised cUSDT.
- **Networks**: Designed for Sepolia with FHE support. Local Hardhat is available for development, but the UI is wired for live testnet addresses via generated config.

## Problems Solved
- **On-chain privacy for contributions**: Pledges remain encrypted; observers cannot link addresses to amounts.
- **Trust-minimized accounting**: Owners see totals via controlled decryption; contributors can decrypt only their own amounts.
- **Operator-based transfers**: Uses ERC-7984 operator approvals to move encrypted funds without exposing values.
- **End-to-end tooling**: Scripts and tasks cover deployment, configuration, encrypted inputs, and ABI syncing for the UI.

## Advantages
- **FHE-native workflow**: Uses Zama's FHEVM types (`euint64`, `externalEuint64`) and relayer SDK so encryption/decryption fits into standard dev flows.
- **Clear separation of reads/writes**: Reads use `viem`; writes use `ethers`, aligning with wallet UX expectations.
- **Deterministic deployments**: Hardhat Deploy records artifacts under `deployments/`, enabling ABI reuse in the frontend without manual edits.
- **User-controlled disclosure**: Decryption flows rely on user EIP-712 signatures; nothing decrypts without explicit consent.
- **Composable token primitive**: `ConfidentialUSDT` can be reused by other contracts needing encrypted balances.

## Architecture & Tech
- **Smart contracts**: Solidity 0.8.27 with Zama FHEVM config, ERC-7984 confidential token standard, operator-based transfers, and encrypted state for totals and per-user contributions.
- **Frontend**: React + Vite + TypeScript with RainbowKit for wallets, `viem` for reads, `ethers` for writes, and Zama relayer SDK for encryption/decryption flows.
- **Tooling**: Hardhat, Hardhat Deploy, TypeChain (ethers v6 bindings), gas reporter, coverage, ESLint/Prettier, and utility scripts for ABI/address propagation.
- **Docs**: FHE contract guidance (`docs/zama_llm.md`) and relayer usage (`docs/zama_doc_relayer.md`) are included for deeper reference.

## Core Flows
1. **Configure fundraiser**: Owner sets name, target amount (plain uint64), and end timestamp.
2. **Prepare funds**: Users mint test cUSDT and set the fundraiser as an operator for encrypted transfers.
3. **Contribute privately**: Users encrypt the amount client-side (relayer SDK), submit `contribute`, and the contract stores encrypted per-user balances plus total.
4. **Decrypt when needed**: Users decrypt their own contribution; the owner decrypts totals; both use signed EIP-712 requests to authorize KMS responses.
5. **End fundraiser**: Owner ends the campaign and transfers all encrypted funds to themselves, preserving confidentiality of individual pledges.

## Repository Layout
- `contracts/` — Solidity sources (`EnigmaFundraising`, `ConfidentialUSDT`, sample `FHECounter`).
- `deploy/` — Hardhat Deploy script (`deploy/deploy.ts`).
- `deployments/` — Network-specific artifacts used to sync ABIs/addresses into the UI (e.g., `deployments/sepolia`).
- `scripts/` — Helpers (`manualDeploy.ts`, `generateContractConfig.js` to refresh UI config from deployments).
- `tasks/` — Hardhat tasks for configuring, contributing, decrypting, and showing addresses.
- `ui/` — React/Vite frontend (no Tailwind, no env vars; uses generated contract config).
- `docs/` — FHE contract and relayer guidance.

## Prerequisites
- Node.js 20+
- npm
- Access to Sepolia via Infura (or equivalent HTTPS RPC)
- Wallet private key with Sepolia ETH for gas (stored in `.env`; mnemonic is not used)

## Setup & Installation
Install root dependencies:
```bash
npm install
```

Environment variables (root `.env`):
```
PRIVATE_KEY=<private key with Sepolia funds>
INFURA_API_KEY=<infura project id>
ETHERSCAN_API_KEY=<optional, for verification>
```

Key scripts:
- `npm run compile` — Compile contracts.
- `npm run test` — Run unit tests.
- `npm run coverage` — Coverage with FHE-aware setup.
- `npm run lint` — Solidity + TypeScript linting.
- `npm run chain` — Start a local Hardhat node for development.
- `npm run deploy:localhost` — Deploy to the local node.
- `npm run deploy:sepolia` — Deploy to Sepolia using `PRIVATE_KEY` and `INFURA_API_KEY`.
- `npm run verify:sepolia` — Verify contracts on Etherscan (optional).

## Deployment Workflow (Sepolia)
1. Set `.env` with `PRIVATE_KEY`, `INFURA_API_KEY`, optional `ETHERSCAN_API_KEY`.
2. Deploy:
   ```bash
   npm run deploy:sepolia
   ```
3. Sync frontend contract config from the recorded deployments (ensures ABI comes from `deployments/sepolia` as required):
   ```bash
   node scripts/generateContractConfig.js
   ```
   This overwrites `ui/src/config/contracts.ts` with the Sepolia addresses and ABIs.
4. (Optional) Verify on Etherscan:
   ```bash
   npm run verify:sepolia -- <contract-address> <constructor-args...>
   ```

## Local Development Notes
- Local Hardhat is available for contract iteration and tests; the production UI targets Sepolia (no localhost network in the UI).
- Use `npm run chain` then `npm run deploy:localhost` to exercise tasks/tests against a local node.
- For CLI-based encrypted interactions, ensure the FHEVM CLI API is initialized (Hardhat plugin handles this during tasks).

## Frontend Usage (`ui/`)
1. Install UI dependencies:
   ```bash
   cd ui
   npm install
   ```
2. Ensure `ui/src/config/contracts.ts` has Sepolia addresses/ABIs generated from `deployments/sepolia` (run the root `generateContractConfig.js` after deployment).
3. Run the app:
   ```bash
   npm run dev
   ```
4. Features:
   - Mint test cUSDT.
   - Set operator permissions for the fundraiser.
   - Encrypt and submit contributions (writes via `ethers`).
   - Read fundraiser status, encrypted handles, and metadata (reads via `viem`).
   - Decrypt own contribution and balances; owner decrypts totals.
   - Configure and end the fundraiser when you are the owner.

## Hardhat Tasks
- `npx hardhat task:fundraiser-address` — Print deployed addresses from `deployments/`.
- `npx hardhat task:configure-fundraiser --name "<title>" --target <uint64> --end <timestamp>` — Configure campaign.
- `npx hardhat task:mint-cusdt --to <address> --amount <uint64>` — Mint test tokens.
- `npx hardhat task:contribute --amount <uint64>` — Make an encrypted contribution via CLI.
- `npx hardhat task:decrypt-contribution --user <address?>` — Decrypt a contributor’s pledge.
- `npx hardhat task:decrypt-total` — Decrypt the aggregate raised amount (owner).

## Security & Privacy Considerations
- Encrypted amounts use Zama’s FHEVM; disclosure requires user-signed EIP-712 requests.
- Contract view functions avoid `msg.sender` in views to prevent hidden state access patterns.
- Operator approvals (`setOperator`) are required before `confidentialTransferFrom` can pull funds.
- Ensure private keys and API keys stay outside the frontend (UI does not use env vars).

## Roadmap Ideas
- Multiple concurrent fundraisers with isolated configs.
- Progress milestones and staged releases for raised funds.
- Additional confidential assets beyond cUSDT.
- Enhanced UX for decryption history and audit logs.
- Deployment presets for additional FHE-enabled testnets/mainnet when available.

## License
BSD-3-Clause-Clear. See `LICENSE`.

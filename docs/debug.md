# Debug Log

## Remove AirtimeEIP3009 Contract
- **Summary:** Identified unused EIP-3009 contract; proceeding with removal to avoid confusion.
- **Commit:** _pending_
- **Files Changed:** `smart_contracts/src/AirtimeEIP3009.sol`
- **Errors:** None encountered.
- **Reproduction:** N/A – no runtime issue.
- **Root Cause:** Legacy experiment contract no longer needed after Permit2 migration.
- **Thought Process:** Considered keeping as reference but removal reduces maintenance overhead.
- **Fix:** Delete the contract file and rely on main `Airtime.sol`.

## Roadmap Expansion for Permit2 Migration
- **Summary:** Added detailed milestones for Permit2 rollout to roadmap.
- **Commit:** _pending_
- **Files Changed:** `docs/roadmap.md`
- **Errors:** None.
- **Reproduction:** N/A.
- **Root Cause:** Needed structured plan before implementation.
- **Thought Process:** Broke work into contract, backend, frontend, and documentation phases.
- **Fix:** Documented milestones with goals, tests, and suggested commits.

## Permit2 Contract Integration Work
- **Summary:** Added Permit2 support to Airtime contract with corresponding tests and deployment updates.
- **Commit:** _pending_
- **Files Changed:** `smart_contracts/src/interfaces/IAllowanceTransfer.sol`, `smart_contracts/src/Airtime.sol`, `smart_contracts/test/Airtime.t.sol`, `smart_contracts/script/Deploy.s.sol`
- **Errors:** None during implementation.
- **Reproduction:** Run `forge test` to validate new happy/negative paths.
- **Root Cause:** Need a single-transaction flow compatible with smart wallets and Permit2.
- **Thought Process:** Introduced Permit2 interface, enforced token/deadline checks, and used a mock Permit2 to test nonce replay and expiry cases.
- **Fix:** Implemented `depositWithPermit2`, added mock-based tests, and updated deployment script to wire Permit2 address.

## Planning Contract Interaction Script
- **Summary:** Outlined milestone to add viem-based script for testing smart contract functions.
- **Commit:** _pending_
- **Files Changed:** `docs/roadmap.md`
- **Errors:** None.
- **Reproduction:** N/A.
- **Root Cause:** Need repeatable way to exercise new contract features outside tests.
- **Thought Process:** Add milestone before coding; script will live in `test_scripts/`.
- **Fix:** Documented plan in roadmap.

## Contract Interaction Script Implementation
- **Summary:** Added viem-based CLI script to trigger Airtime contract methods.
- **Commit:** _pending_
- **Files Changed:** `test_scripts/airtime-contract.js`
- **Errors:** None.
- **Reproduction:** Run `node test_scripts/airtime-contract.js summary` (with env vars).
- **Root Cause:** Needed manual testing utility for Base Sepolia deployments.
- **Thought Process:** Provide summary, deposit, permit2 deposit, refund, and withdraw commands with minimal dependencies.
- **Fix:** Implemented script with env-driven configuration and CLI parser.

## Planning Contract Deployment Script
- **Summary:** Defined milestone for deployment helper script.
- **Commit:** _pending_
- **Files Changed:** `docs/roadmap.md`
- **Errors:** None.
- **Reproduction:** N/A.
- **Root Cause:** Need an easy way to deploy updated contract without touching Foundry scripts.
- **Thought Process:** Use viem to broadcast deployment leveraging compiled artifact.
- **Fix:** Added milestone entry.

## Contract Deployment Script Implementation
- **Summary:** Added viem-based script to deploy Airtime contract using compiled artifact.
- **Commit:** _pending_
- **Files Changed:** `test_scripts/deploy-airtime.js`
- **Errors:** None.
- **Reproduction:** Ensure env vars set, then `node test_scripts/deploy-airtime.js`.
- **Root Cause:** Streamline deployments without running Forge scripts.
- **Thought Process:** Read Forge artifact, normalize env addresses, deploy via wallet client, and wait for receipt.
- **Fix:** Implemented CLI with parameter logging and receipt validation.

## Planning Shared Env & Deployment Metadata
- **Summary:** Need to centralize env vars and persist deployment outputs for reuse.
- **Commit:** _pending_
- **Files Changed:** `docs/roadmap.md`
- **Errors:** None.
- **Reproduction:** N/A.
- **Root Cause:** Scripts currently require manual exports, and interaction script lacks deployment context.
- **Thought Process:** Use `.env` and `deployment.json`.
- **Fix:** Documented new milestone.

## Added Shared Test Script Env File
- **Summary:** Introduced `test_scripts/.env` to store reusable RPC, token, and key configuration.
- **Commit:** _pending_
- **Files Changed:** `test_scripts/.env`
- **Errors:** None.
- **Reproduction:** N/A.
- **Root Cause:** Needed persistent configuration instead of manual exports for each run.
- **Thought Process:** Mirror frontend values so CLI scripts share the same defaults.
- **Fix:** Added `.env` with RPC, contract, treasury, permit2, and private key entries.

## Enhanced Script Metadata Handling
- **Summary:** Updated deployment and interaction scripts to load `.env` and persist/read `deployment.json`.
- **Commit:** _pending_
- **Files Changed:** `test_scripts/deploy-airtime.js`, `test_scripts/airtime-contract.js`
- **Errors:** None.
- **Reproduction:** Deploy via `node test_scripts/deploy-airtime.js`, then run `node test_scripts/airtime-contract.js summary`.
- **Root Cause:** Needed automatic sharing of deployed contract address and wallet information.
- **Thought Process:** Simple env parser avoids extra dependencies; deployment metadata powers helper scripts.
- **Fix:** Load `.env`, write deployment metadata after deploy, and read it in the interaction CLI.

## Convert CLI Scripts to JavaScript ESM
- **Summary:** Migrated deployment and interaction helpers from TypeScript to pure JavaScript modules.
- **Commit:** _pending_
- **Files Changed:** `test_scripts/deploy-airtime.js`, `test_scripts/airtime-contract.js`, `test_scripts/package.json`
- **Errors:** Previous ts-node-specific type errors (`TS2322`) and `__dirname` references were resolved by the conversion.
- **Reproduction:** `node test_scripts/deploy-airtime.js`, `node test_scripts/airtime-contract.js summary`
- **Root Cause:** Requested move to .js files for easier execution without ts-node.
- **Thought Process:** Leverage Node ESM, reuse existing logic, and ensure env/deployment metadata continue to work.
- **Fix:** Added shebangs for Node, introduced `type: "module"` package setting, and dropped TypeScript-only constructs.

## Planning Permit2 Permit Generator
- **Summary:** Need helper to create permit JSON/signature inputs for `depositWithPermit2`.
- **Commit:** _pending_
- **Files Changed:** `docs/roadmap.md`
- **Errors:** None.
- **Reproduction:** N/A.
- **Root Cause:** Repeated manual creation of permit payloads is error-prone.
- **Thought Process:** Add CLI to output nonce/deadline formatted correctly.
- **Fix:** Documented milestone ahead of implementation.

## Permit2 Permit Generator Implementation
- **Summary:** Added CLI to generate Permit2 permit payload JSON with amount/nonce/deadline.
- **Commit:** _pending_
- **Files Changed:** `test_scripts/generate-permit.js`
- **Errors:** None.
- **Reproduction:** `node test_scripts/generate-permit.js --amount 10 --out permit.json`
- **Root Cause:** Needed reusable way to craft permit inputs for deposit-permit2 testing.
- **Thought Process:** Reuse existing env parsing, provide CLI overrides, and output guidance for signing.
- **Fix:** Implemented script generating permit JSON with random nonce and configurable deadline.

## Planning Permit Signature Helper
- **Summary:** Need script to sign Permit2 payloads via local wallet.
- **Commit:** _pending_
- **Files Changed:** `docs/roadmap.md`
- **Errors:** None.
- **Reproduction:** N/A.
- **Root Cause:** Previous instruction requires manual signature step.
- **Thought Process:** Automate using viem and env private key.
- **Fix:** Document milestone.

## Permit Signature Helper Implementation
- **Summary:** Added script to sign Permit2 payloads using the configured treasury/private key.
- **Commit:** _pending_
- **Files Changed:** `test_scripts/sign-permit.js`
- **Errors:** None.
- **Reproduction:** `node test_scripts/sign-permit.js --permit permit.json --out signature.txt`
- **Root Cause:** Needed quick path from permit JSON to signature for deposit-permit2 testing.
- **Thought Process:** Reuse viem wallet client and environment config; validate payload before signing.
- **Fix:** Implemented CLI that outputs signature and suggested next command.

## Fix Permit2 Domain Version in Signature Script
- **Summary:** depositWithPermit2 calls failed with Permit2 error `0x815e1d64` (InvalidSignature) due to missing domain version.
- **Commit:** _pending_
- **Files Changed:** `test_scripts/sign-permit.js`
- **Errors:** `Encoded error signature "0x815e1d64" not found on ABI.` (maps to InvalidSignature).
- **Reproduction:** `node airtime-contract.js deposit-permit2 ...` after signing without version.
- **Root Cause:** Permit2 EIP-712 domain must include version "1"; omission causes signature mismatch.
- **Thought Process:** Align domain with Uniswap Permit2 spec.
- **Fix:** Added `version: '1'` to domain definition before signing.

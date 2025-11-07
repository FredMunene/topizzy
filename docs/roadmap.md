# Roadmap

## Milestone: Remove AirtimeEIP3009 Contract
- **Goals:** Delete unused `smart_contracts/src/AirtimeEIP3009.sol` to avoid confusion with the Permit2 migration.
- **Planned Changes:** Remove contract file and update references (none currently).
- **Tests to Add/Run:** `forge fmt` (format check) and ensure `forge test` still passes (no new tests required).
- **Expected Runtime/Complexity:** O(1) deletion; negligible runtime.
- **Suggested Commit Message:** `chore: remove AirtimeEIP3009 legacy contract`
- **Status:** Pending

## Milestone: Permit2 Contract Integration
- **Goals:** Add Permit2-based `depositWithPermit2` entry point to `smart_contracts/src/Airtime.sol` and wire in interface dependencies.
- **Planned Changes:** Modify Airtime contract, add Permit2 interface under `smart_contracts/src/lib` (or equivalent), update events if needed.
- **Tests to Add/Run:** New Forge tests covering successful Permit2 deposits, ERC-1271 (mock) signer validation, and failure paths (expired deadline, reused nonce).
- **Expected Runtime/Complexity:** Medium; requires new solidity code plus test harness updates.
- **Suggested Commit Message:** `feat: add permit2 deposit flow to airtime contract`
- **Status:** Pending

## Milestone: Backend Permit2 Support
- **Goals:** Update `/app/api/airtime/send` to accept Permit2 payloads, persist nonce/deadline in Supabase, and call new contract method.
- **Planned Changes:** Adjust request schema, Supabase writes, and add unit/integration tests for API validation.
- **Tests to Add/Run:** Jest/Playwright (or existing framework) tests for new API validation, mocked contract call, negative cases (invalid signature).
- **Expected Runtime/Complexity:** Medium.
- **Suggested Commit Message:** `feat: support permit2 payments in airtime api`
- **Status:** Pending

## Milestone: Frontend Permit2 + AA Flow
- **Goals:** Replace approve-flow in `frontend/app/page.tsx` with Permit2 signing + ERC-4337 userOp submission, add fallback for EOAs.
- **Planned Changes:** New helpers in `frontend/lib`, UI updates, environment wiring for paymaster endpoint.
- **Tests to Add/Run:** React component/unit tests for signing helper, integration smoke test plan (manual) documented.
- **Expected Runtime/Complexity:** High.
- **Suggested Commit Message:** `feat: switch frontend airtime flow to permit2`
- **Status:** Pending

## Milestone: Documentation & Ops Updates
- **Goals:** Update README/architecture docs with new flow, finalize ADR references, document rollout procedure.
- **Planned Changes:** Update `docs/airtime-payments-plan.md`, root README, and any runbooks.
- **Tests to Add/Run:** Documentation lint or link check (if available).
- **Expected Runtime/Complexity:** Low.
- **Suggested Commit Message:** `docs: update airtime flow rollout notes`
- **Status:** Pending

## Milestone: Contract Interaction Test Script
- **Goals:** Add a Node script under `test_scripts/` to call new Permit2-enabled contract functions against Base Sepolia.
- **Planned Changes:** Create script that loads env vars, uses viem or ethers to invoke `depositWithPermit2`, `deposit`, `refund`, including mock data for testing.
- **Tests to Add/Run:** Manual execution with dry-run network call; add script-level assertions/logs.
- **Expected Runtime/Complexity:** Medium.
- **Suggested Commit Message:** `feat: add contract interaction test script`
- **Status:** Pending

## Milestone: Contract Deployment Script
- **Goals:** Provide a command-line script to deploy the Airtime contract with Permit2 support.
- **Planned Changes:** Create `test_scripts/deploy-airtime.js` that reads compiled artifact, deploys via viem, and prints address.
- **Tests to Add/Run:** Manual run against Base Sepolia with a funded key; verify contract yields expected addresses.
- **Expected Runtime/Complexity:** Medium.
- **Suggested Commit Message:** `feat: add airtime deployment script`
- **Status:** Pending

## Milestone: Test Script Environment & Deployment Artifact
- **Goals:** Store shared env vars under `test_scripts/.env` and persist deployed contract metadata for reuse.
- **Planned Changes:** Add `.env`, modify deploy script to write `deployment.json`, update interaction script to read values.
- **Tests to Add/Run:** Manual run of deploy script, then interaction script using stored deployment info.
- **Expected Runtime/Complexity:** Low-medium.
- **Suggested Commit Message:** `chore: centralize script env and deployment metadata`
- **Status:** Pending

## Milestone: Permit2 Permit Generator Script
- **Goals:** Provide CLI helper to produce Permit2 permit payloads (JSON) with amount/nonce/deadline for testing.
- **Planned Changes:** Add `test_scripts/generate-permit.js`, support env defaults and random nonce generation, write output file.
- **Tests to Add/Run:** Manual run generating sample permit, then use with `airtime-contract.js deposit-permit2`.
- **Expected Runtime/Complexity:** Low.
- **Suggested Commit Message:** `feat: add permit2 permit generator script`
- **Status:** Pending

## Milestone: Permit2 Signature Script
- **Goals:** Allow developers to sign permit payloads locally using configured wallet keys.
- **Planned Changes:** Add `test_scripts/sign-permit.js` that reads permit JSON, loads env config, and outputs signature (optionally saves to file).
- **Tests to Add/Run:** Manual run piping output into `deposit-permit2` CLI.
- **Expected Runtime/Complexity:** Low.
- **Suggested Commit Message:** `feat: add permit2 signature helper`
- **Status:** Pending

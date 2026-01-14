/**
 * Common ABIs used across multiple scripts
 */
import { parseAbi } from "viem";

/** Standard ERC20 functions */
export const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
]);

/** Minimal balanceOf for any contract implementing IVotingModule */
export const BALANCE_OF_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
]);

/** Dragon's Lair (dQUICK staking) */
export const DRAGON_LAIR_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function QUICKBalance(address) view returns (uint256)",
  "function dQUICKForQUICK(uint256) view returns (uint256)",
  "function QUICKForDQUICK(uint256) view returns (uint256)",
]);

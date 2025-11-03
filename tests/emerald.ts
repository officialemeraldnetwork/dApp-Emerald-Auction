import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Emerald } from "../target/types/emerald";

describe("emerald", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.emerald as Program<Emerald>;

  it("Is initialized!", async () => {
    // Add your test here.
    const tx = await program.methods.initializePlatform().rpc;
    console.log("Your transaction signature", tx);
  });
});

import { scryptSync, randomBytes } from "node:crypto";
import { createInterface } from "node:readline";

const rl = createInterface({ input: process.stdin, output: process.stdout });
rl.question("Enter a strong admin password (input may be visible): ", (password) => {
  if (password.length < 14) {
    console.error("Use at least 14 characters.");
    rl.close();
    process.exitCode = 1;
    return;
  }
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  console.log("\nADMIN_PASSWORD_HASH=$scrypt$" + salt.toString("hex") + "$" + hash.toString("hex"));
  console.log("Copy this value into Vercel Environment Variables. Do not commit it.");
  rl.close();
});

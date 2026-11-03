import { scryptSync, randomBytes } from "node:crypto";

if (!process.stdin.isTTY || !process.stdin.setRawMode) {
  console.error("Run this script in an interactive terminal so the password stays hidden.");
  process.exit(1);
}

process.stdout.write("Enter a strong admin password (minimum 14 characters): ");
process.stdin.setRawMode(true);
process.stdin.resume();
let password = "";

process.stdin.on("data", (chunk) => {
  const value = chunk.toString("utf8");
  for (const char of value) {
    if (char === "\u0003") {
      process.stdout.write("\nCancelled.\n");
      process.exit(1);
    }
    if (char === "\r" || char === "\n") {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
      if (password.length < 14) {
        console.error("Use at least 14 characters.");
        process.exit(1);
      }
      const salt = randomBytes(16);
      const hash = scryptSync(password, salt, 64);
      password = "";
      console.log("ADMIN_PASSWORD_HASH=$scrypt$" + salt.toString("hex") + "$" + hash.toString("hex"));
      console.log("Add this value only to Vercel Environment Variables. Never commit it.");
      process.exit(0);
    }
    if (char === "\u007f" || char === "\b") {
      password = password.slice(0, -1);
      process.stdout.write("\b \b");
    } else {
      password += char;
      process.stdout.write("*");
    }
  }
});

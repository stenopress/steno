import { assert, assertEquals, assertRejects, assertThrows } from "@std/assert";
import { join, toFileUrl } from "@std/path";
import {
  beginOutputTransaction,
  commitOutputTransaction,
  type OutputTransactionFileSystem,
  rollbackOutputTransaction,
} from "./output_transaction.ts";

function realFileSystem(): OutputTransactionFileSystem {
  return {
    lstatSync: (path) => Deno.lstatSync(path),
    makeTempDirSync: (options) => Deno.makeTempDirSync(options),
    removeSync: (path, options) => Deno.removeSync(path, options),
    renameSync: (oldpath, newpath) => Deno.renameSync(oldpath, newpath),
  };
}

function failRename(
  failureCall: number,
  error: Error,
): OutputTransactionFileSystem {
  const fs = realFileSystem();
  let calls = 0;
  return {
    ...fs,
    renameSync(oldpath, newpath) {
      calls++;
      if (calls === failureCall) throw error;
      fs.renameSync(oldpath, newpath);
    },
  };
}

function createTransactionFixture(fs = realFileSystem()): {
  root: string;
  outputDir: string;
  transaction: ReturnType<typeof beginOutputTransaction>;
} {
  const root = Deno.makeTempDirSync({ prefix: "steno-transaction-" });
  const outputDir = join(root, "dist");
  Deno.mkdirSync(outputDir);
  Deno.writeTextFileSync(join(outputDir, "index.html"), "last-good");
  const transaction = beginOutputTransaction(outputDir, fs);
  Deno.writeTextFileSync(join(transaction.stagingDir, "index.html"), "next");
  return { root, outputDir, transaction };
}

function cleanup(path: string): void {
  try {
    Deno.removeSync(path, { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
}

export function registerOutputTransactionTests(): void {
  Deno.test({
    name: "transactions: permission failure while backing up preserves output",
    permissions: { read: true, write: true },
    fn: () => {
      const fs = failRename(
        1,
        new Deno.errors.PermissionDenied("simulated permission failure"),
      );
      const fixture = createTransactionFixture(fs);
      try {
        assertThrows(
          () => commitOutputTransaction(fixture.transaction),
          Deno.errors.PermissionDenied,
        );
        assertEquals(
          Deno.readTextFileSync(join(fixture.outputDir, "index.html")),
          "last-good",
        );
        rollbackOutputTransaction(fixture.transaction);
      } finally {
        cleanup(fixture.root);
      }
    },
  });

  Deno.test({
    name: "transactions: disk-full promotion failure restores output",
    permissions: { read: true, write: true },
    fn: () => {
      const fs = failRename(
        2,
        new Deno.errors.WriteZero("simulated disk full"),
      );
      const fixture = createTransactionFixture(fs);
      try {
        assertThrows(
          () => commitOutputTransaction(fixture.transaction),
          Deno.errors.WriteZero,
        );
        assertEquals(
          Deno.readTextFileSync(join(fixture.outputDir, "index.html")),
          "last-good",
        );
        rollbackOutputTransaction(fixture.transaction);
      } finally {
        cleanup(fixture.root);
      }
    },
  });

  Deno.test({
    name:
      "transactions: failures at each promotion rename preserve recoverable state",
    permissions: { read: true, write: true },
    fn: () => {
      for (const failureCall of [1, 2, 3]) {
        const fs = failRename(
          failureCall,
          new Deno.errors.Interrupted(`rename ${failureCall}`),
        );
        const fixture = createTransactionFixture(fs);
        const backupDir = fixture.transaction.backupDir;
        Deno.mkdirSync(backupDir);
        Deno.writeTextFileSync(join(backupDir, "index.html"), "older-backup");
        try {
          assertThrows(
            () => commitOutputTransaction(fixture.transaction),
            Deno.errors.Interrupted,
          );
          assertEquals(
            Deno.readTextFileSync(join(fixture.outputDir, "index.html")),
            "last-good",
          );
          assertEquals(
            Deno.readTextFileSync(join(backupDir, "index.html")),
            "older-backup",
          );
          rollbackOutputTransaction(fixture.transaction);
        } finally {
          cleanup(fixture.root);
        }
      }
    },
  });

  Deno.test({
    name: "transactions: real process termination is recovered on next build",
    permissions: { read: true, write: true, run: true },
    fn: async () => {
      const root = Deno.makeTempDirSync({ prefix: "steno-killed-build-" });
      const outputDir = join(root, "dist");
      Deno.mkdirSync(outputDir);
      Deno.writeTextFileSync(join(outputDir, "index.html"), "last-good");
      const moduleUrl = toFileUrl(
        join(Deno.cwd(), "src/core/build/output_transaction.ts"),
      ).href;
      const script = `
        const { beginOutputTransaction } = await import(${
        JSON.stringify(moduleUrl)
      });
        const transaction = beginOutputTransaction(${
        JSON.stringify(outputDir)
      });
        Deno.writeTextFileSync(
          ${JSON.stringify(join(root, "child-stage.txt"))},
          transaction.stagingDir,
        );
        Deno.renameSync(transaction.outputDir, transaction.backupDir);
        Deno.exit(137);
      `;
      try {
        const result = await new Deno.Command(Deno.execPath(), {
          args: ["eval", script],
          stdout: "null",
          stderr: "piped",
        }).output();
        assertEquals(
          result.code,
          137,
          new TextDecoder().decode(result.stderr),
        );
        await assertRejects(
          () => Deno.readTextFile(join(outputDir, "index.html")),
          Deno.errors.NotFound,
        );

        const recovered = beginOutputTransaction(outputDir);
        assertEquals(
          Deno.readTextFileSync(join(outputDir, "index.html")),
          "last-good",
        );
        rollbackOutputTransaction(recovered);
      } finally {
        cleanup(root);
      }
    },
  });

  Deno.test({
    name:
      "transactions: failed recovery reports both promotion and recovery errors",
    permissions: { read: true, write: true },
    fn: () => {
      const base = realFileSystem();
      let renameCalls = 0;
      const fs: OutputTransactionFileSystem = {
        ...base,
        renameSync(oldpath, newpath) {
          renameCalls++;
          if (renameCalls === 2) {
            throw new Deno.errors.WriteZero("promotion failed");
          }
          if (renameCalls === 3) {
            throw new Deno.errors.PermissionDenied("restore failed");
          }
          base.renameSync(oldpath, newpath);
        },
      };
      const fixture = createTransactionFixture(fs);
      try {
        const error = assertThrows(
          () => commitOutputTransaction(fixture.transaction),
          AggregateError,
          "transaction recovery was incomplete",
        );
        assertEquals(error.errors.length, 2);
        assert(Deno.statSync(fixture.transaction.backupDir).isDirectory);
      } finally {
        cleanup(fixture.root);
      }
    },
  });
}

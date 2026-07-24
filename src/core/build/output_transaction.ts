import { basename, dirname, join, resolve } from "@std/path";
import { ensureDirSync } from "../../utils/fileUtils.ts";

export interface OutputTransaction {
  outputDir: string;
  stagingDir: string;
  backupDir: string;
  fs: OutputTransactionFileSystem;
}

/** Filesystem operations used by output transactions. */
export interface OutputTransactionFileSystem {
  lstatSync(path: string): Deno.FileInfo;
  makeTempDirSync(options: Deno.MakeTempOptions): string;
  removeSync(path: string, options?: Deno.RemoveOptions): void;
  renameSync(oldpath: string, newpath: string): void;
}

const defaultFileSystem: OutputTransactionFileSystem = {
  lstatSync: (path) => Deno.lstatSync(path),
  makeTempDirSync: (options) => Deno.makeTempDirSync(options),
  removeSync: (path, options) => Deno.removeSync(path, options),
  renameSync: (oldpath, newpath) => Deno.renameSync(oldpath, newpath),
};

function pathExists(
  path: string,
  fs: OutputTransactionFileSystem,
): boolean {
  try {
    fs.lstatSync(path);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}

function removeTree(path: string, fs: OutputTransactionFileSystem): void {
  if (pathExists(path, fs)) fs.removeSync(path, { recursive: true });
}

export function beginOutputTransaction(
  outputDir: string,
  fs: OutputTransactionFileSystem = defaultFileSystem,
): OutputTransaction {
  const absoluteOutput = resolve(outputDir);
  const parent = dirname(absoluteOutput);
  if (absoluteOutput === parent) {
    throw new Error("The filesystem root cannot be used as a Steno output.");
  }
  if (absoluteOutput === resolve(Deno.cwd())) {
    throw new Error(
      "The project working directory cannot be used as a Steno output.",
    );
  }

  ensureDirSync(parent);
  const name = basename(absoluteOutput);
  const backupDir = join(parent, `.${name}.steno-backup`);

  // Recover a prior promotion interrupted after output was moved to backup.
  if (!pathExists(absoluteOutput, fs) && pathExists(backupDir, fs)) {
    fs.renameSync(backupDir, absoluteOutput);
  }

  const stagingDir = fs.makeTempDirSync({
    dir: parent,
    prefix: `.${name}.steno-stage-`,
  });
  return { outputDir: absoluteOutput, stagingDir, backupDir, fs };
}

export function commitOutputTransaction(
  transaction: OutputTransaction,
): void {
  const { outputDir, stagingDir, backupDir, fs } = transaction;
  const hadOutput = pathExists(outputDir, fs);
  const previousBackup = pathExists(backupDir, fs)
    ? `${backupDir}.retired-${crypto.randomUUID()}`
    : undefined;
  let previousBackupRetired = false;
  let outputBackedUp = false;

  try {
    if (previousBackup) {
      fs.renameSync(backupDir, previousBackup);
      previousBackupRetired = true;
    }
    if (hadOutput) {
      fs.renameSync(outputDir, backupDir);
      outputBackedUp = true;
    }
    fs.renameSync(stagingDir, outputDir);
  } catch (error) {
    const recoveryErrors: unknown[] = [];
    if (
      outputBackedUp && !pathExists(outputDir, fs) &&
      pathExists(backupDir, fs)
    ) {
      try {
        fs.renameSync(backupDir, outputDir);
        outputBackedUp = false;
      } catch (recoveryError) {
        recoveryErrors.push(recoveryError);
      }
    }
    if (
      previousBackup && previousBackupRetired &&
      !pathExists(backupDir, fs)
    ) {
      try {
        fs.renameSync(previousBackup, backupDir);
        previousBackupRetired = false;
      } catch (recoveryError) {
        recoveryErrors.push(recoveryError);
      }
    }
    if (recoveryErrors.length > 0) {
      throw new AggregateError(
        [error, ...recoveryErrors],
        "Output promotion failed and transaction recovery was incomplete.",
      );
    }
    throw error;
  }

  if (previousBackup) {
    void Promise.resolve().then(() => {
      fs.removeSync(previousBackup, { recursive: true });
    }).catch((error) => {
      console.warn(
        `Build committed, but failed to remove retired backup "${previousBackup}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  }
}

export function rollbackOutputTransaction(
  transaction: OutputTransaction,
): void {
  const { fs } = transaction;
  removeTree(transaction.stagingDir, fs);
  if (
    !pathExists(transaction.outputDir, fs) &&
    pathExists(transaction.backupDir, fs)
  ) {
    fs.renameSync(transaction.backupDir, transaction.outputDir);
  }
}

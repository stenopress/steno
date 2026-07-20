import { basename, dirname, join, resolve } from "@std/path";
import { ensureDirSync } from "../../utils/fileUtils.ts";

export interface OutputTransaction {
  outputDir: string;
  stagingDir: string;
  backupDir: string;
}

function pathExists(path: string): boolean {
  try {
    Deno.lstatSync(path);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}

function removeTree(path: string): void {
  if (pathExists(path)) Deno.removeSync(path, { recursive: true });
}

export function beginOutputTransaction(outputDir: string): OutputTransaction {
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
  if (!pathExists(absoluteOutput) && pathExists(backupDir)) {
    Deno.renameSync(backupDir, absoluteOutput);
  }

  const stagingDir = Deno.makeTempDirSync({
    dir: parent,
    prefix: `.${name}.steno-stage-`,
  });
  return { outputDir: absoluteOutput, stagingDir, backupDir };
}

export function commitOutputTransaction(
  transaction: OutputTransaction,
): void {
  const { outputDir, stagingDir, backupDir } = transaction;
  const hadOutput = pathExists(outputDir);
  const previousBackup = pathExists(backupDir)
    ? `${backupDir}.retired-${crypto.randomUUID()}`
    : undefined;
  if (previousBackup) Deno.renameSync(backupDir, previousBackup);
  if (hadOutput) Deno.renameSync(outputDir, backupDir);

  try {
    Deno.renameSync(stagingDir, outputDir);
  } catch (error) {
    if (hadOutput && !pathExists(outputDir) && pathExists(backupDir)) {
      Deno.renameSync(backupDir, outputDir);
    }
    if (previousBackup && !pathExists(backupDir)) {
      Deno.renameSync(previousBackup, backupDir);
    }
    throw error;
  }

  if (previousBackup) {
    void Deno.remove(previousBackup, { recursive: true }).catch((error) => {
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
  removeTree(transaction.stagingDir);
  if (
    !pathExists(transaction.outputDir) &&
    pathExists(transaction.backupDir)
  ) {
    Deno.renameSync(transaction.backupDir, transaction.outputDir);
  }
}

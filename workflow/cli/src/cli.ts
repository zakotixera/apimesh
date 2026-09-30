#!/usr/bin/env node
import { Command } from 'commander';
import { extractCommand } from './extract';
import { validateCommand } from './validate';
import { renderCommand } from './render';
import { driftCommand } from './drift';
import { testCommand } from './test';

async function main(): Promise<void> {
  const program = new Command();
  program
    .name('apic')
    .description('bilibili-collection deterministic executor (HAR -> canonical -> dist)')
    .version('0.1.0');

  program.addCommand(extractCommand());
  program.addCommand(validateCommand());
  program.addCommand(renderCommand());
  program.addCommand(driftCommand());
  program.addCommand(testCommand());

  await program.parseAsync(process.argv);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});

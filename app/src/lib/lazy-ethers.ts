/**
 * `ethers`, loaded on first use instead of in the entry chunk.
 *
 * Six modules the home page imports eagerly used to import it statically, which put 124 KB of it on the
 * critical path of a first paint that needs none of it — every runtime use is inside something async that
 * runs later (a balance read, an oracle read, restoring a session). Type imports stay static and cost
 * nothing at runtime.
 *
 * One shared promise rather than an `import()` per call site: concurrent callers wait on the same load,
 * and it also stops vitest from handing one of two racing imports the un-mocked module.
 */
let loading: Promise<typeof import('ethers')> | undefined

export async function loadEthers(): Promise<(typeof import('ethers'))['ethers']> {
  loading ??= import('ethers')
  return (await loading).ethers
}

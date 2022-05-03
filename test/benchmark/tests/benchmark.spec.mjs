import test from '@playwright/test';
test('Run benchmarks', async ({ page }) => {
    let benchmarkPromise = new Promise((resolve) => {
      page.on("console", async (message) => {
        if (message.text() === "Benchmark suite complete.") {
          // if the suite has finished, we're done
          resolve();
        } else {
          // pipe through any other console output
          console[message.type()](message);
        }
      });
    });

  await page.goto(`file://${process.cwd()}/test/benchmark/tests/bench.html`);
});
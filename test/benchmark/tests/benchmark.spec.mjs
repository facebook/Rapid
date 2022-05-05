import test from '@playwright/test';

test('Run benchmarks', async ({ page }) => {
    let benchmarkPromise = new Promise((resolve) => {
      page.on("console", async (message) => {
        if (message.text() === "Benchmark suite complete.") {
          // if the suite has finished, we're done
          resolve();
        } else if (message.text().includes('sampled') || message.text().toLowerCase().includes('benchmark')) {
          console.log(message);
        } else {
          // pipe through any other console output
         //console.warn(message);
        }
      });
    });

  await page.goto(`http://127.0.0.1:8080/test/benchmark/bench.html`);
});
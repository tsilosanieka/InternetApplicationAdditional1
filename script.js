const axios = require('axios'); 
const { JSDOM, VirtualConsole } = require('jsdom'); 
const robotsParser = require('robots-parser');
const url = require('url');

const USER_AGENT = 'MyAssignmentScraper/1.0';
const START_URL = 'https://pcshop.ge/product-category/pc-hardware/ssd/?ep_filter_pa_brand=samsung';
const ROBOTS_URL = 'https://pcshop.ge/robots.txt';

const virtualConsole = new VirtualConsole();
virtualConsole.on("cssError", () => {
});


function parsePrice(priceString) {
  if (!priceString) return null;
  const cleanedString = priceString.replace('₾', '').replace(',', '').split('.')[0].trim();
  return parseInt(cleanedString, 10);
}

function getCapacityInGB(name) {
  if (!name) return null;
  const match = name.match(/(\d+)\s*(TB|GB)/i);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2].toUpperCase();

  if (unit === 'TB') {
    return value * 1000;
  } else if (unit === 'GB') {
    return value;
  }
  return null;
}


async function mainScraper() {
  try {
    console.log(`Checking robots.txt at: ${ROBOTS_URL}`);

    const { data: robotsFile } = await axios.get(ROBOTS_URL);
    const robots = robotsParser(ROBOTS_URL, robotsFile);

    const isAllowed = robots.isAllowed(START_URL, USER_AGENT);

    if (!isAllowed) {
      console.error(`Scraping is DISALLOWED by robots.txt for User-Agent: "${USER_AGENT}". Exiting...`);
      return;
    }
    console.log('Scraping is allowed. Proceeding...');


    let currentUrl = START_URL;
    const allProcessedProducts = [];
    let pageCount = 1;

    while (currentUrl) {
      console.log(`\nScraping page ${pageCount}: ${currentUrl}`);

      const { data: html } = await axios.get(currentUrl, {
        headers: { 'User-Agent': USER_AGENT }
      });
      
      const dom = new JSDOM(html, { virtualConsole: virtualConsole });
      const document = dom.window.document;

      const productElements = document.querySelectorAll('li.product');
      console.log(`Found ${productElements.length} product elements on this page.`);

      if (productElements.length === 0) {
        console.log("No products found, stopping pagination.");
        break;
      }

      let productsOnThisPage = 0;

      productElements.forEach((element) => {
        const nameElement = element.querySelector('h2.woocommerce-loop-product__title');
        const priceElement = element.querySelector('span.woocommerce-Price-amount bdi');

        if (nameElement && priceElement) {
          const name = nameElement.textContent.trim();
          const price = parsePrice(priceElement.textContent.trim());
          const capacityGB = getCapacityInGB(name);

          if (price && capacityGB) {
            const unitPricePerGB = price / capacityGB;

            allProcessedProducts.push({
              name: name,
              price: `₾${price}`,
              capacityGB: `${capacityGB} GB`,
              unitPrice: unitPricePerGB.toFixed(2),
            });
            productsOnThisPage++;
          }
        }
      });
      console.log(`Successfully processed ${productsOnThisPage} valid products.`);

      const nextLinkElement = document.querySelector('a.next.page-numbers');

      if (nextLinkElement) {
        currentUrl = new url.URL(nextLinkElement.href, START_URL).href;
        pageCount++;
      } else {
        console.log('\nNo "Next Page" link found. This was the last page.');
        currentUrl = null; 
      }
    }

    console.log(`\nTotal products processed from all ${pageCount} page(s): ${allProcessedProducts.length}`);

    if (allProcessedProducts.length === 0) {
      console.log("No products were found in total.");
      return;
    }

    console.log('\nSorting final list by unit price...');
    allProcessedProducts.sort((a, b) => parseFloat(a.unitPrice) - parseFloat(b.unitPrice));
    console.log('\n------------------------------------------');
    console.log('Final SSD Ranking (Sorted by Price per GB)');
    console.log('------------------------------------------\n');
    allProcessedProducts.forEach((product) => {
      console.log(
        `Product: ${product.name}\n` +
          `  Price: ${product.price}\n` +
          `  Capacity: ${product.capacityGB}\n` +
          `  Unit Price: ₾${product.unitPrice} / GB\n` +
          `--------------------------------------------------`
      );
    });

  } catch (error) {
    console.error('An error occurred during the scraping process:', error.message);
  }
}


mainScraper();

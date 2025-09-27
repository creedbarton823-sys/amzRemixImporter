import axios from 'axios';

export type AmazonProduct = {
  name: string;
  product_information: {
    manufacturer: string;
    brand: string;
    part_number: string;
    product_dimensions: string;
    package_dimensions: string;
    item_model_number: string;
    colour: string;
    style: string;
    finish: string;
    material: string;
    shape: string;
    number_of_pieces: string;
    handle_material: string;
    special_features: string;
    included_components: string;
    batteries_included: string;
    batteries_required: string;
    item_weight: string;
    asin: string;
    customer_reviews: {
      ratings_count: number;
      stars: number;
    };
    best_sellers_rank: string[];
    date_first_available: string;
  };
  brand: string;
  brand_url: string;
  full_description: string;
  pricing: string;
  shipping_price: string;
  shipping_time: string;
  shipping_condition: string;
  shipping_details_url: string;
  availability_status: string;
  is_coupon_exists: boolean;
  images: string[];
  product_category: string;
  feature_bullets: string[];
  total_reviews: number;
  model: string;
  ships_from: string;
  aplus_present: boolean;
  reviews: any[]; 
};


  


export async function getAmazonProductUK(asin: string): Promise<AmazonProduct | null> {
  const API_KEY = process.env.SCRAPER_API_KEY;
  
  if (!API_KEY) {
    throw new Error('SCRAPER_API_KEY is required');
  }

  const url = 'https://api.scraperapi.com/structured/amazon/product';
  
  try {
    console.log(`Fetching ASIN: ${asin} from Amazon UK`);
    
    const response = await axios.get(url, {
      params: {
        api_key: API_KEY,
        asin: asin,
        tld: 'co.uk',
        country: 'gb'
      },
      timeout: 60000
    });

    if (response.status !== 200 || !response.data) {
      return null;
    }

    return response.data
    
  } catch (error: any) {
    console.error(`Error fetching ASIN ${asin}:`, error.message);
    throw error;
  }
}


export async function rephraseTitle(originalTitle: string | undefined) {
  //const API_KEY = process.env.DEEPSEEK_API_KEY; 
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const maxRetries = 3;
  let retries = 0;

  await delay(10000 + Math.random() * 2000);

  const models = [
    'deepseek/deepseek-chat-v3.1:free', 
    'x-ai/grok-4-fast:free', 
    'openai/gpt-oss-20b:free', 
    'cognitivecomputations/dolphin-mistral-24b-venice-edition:free',
    'tngtech/deepseek-r1t2-chimera:free',
    'microsoft/mai-ds-r1:free',
    'meta-llama/llama-4-maverick:free',
    'qwen/qwen2.5-vl-72b-instruct:free',
    'google/gemini-2.0-flash-exp:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'mistralai/mistral-small-3.2-24b-instruct:free',
    'deepseek/deepseek-chat-v3-0324:free'
  ];

  const apiKeys = [
    process.env.DEEPSEEK_API_KEY,
    // process.env.DEEPSEEK_API_KEY2,
    // process.env.DEEPSEEK_API_KEY3,
    // process.env.DEEPSEEK_API_KEY4,
    // process.env.DEEPSEEK_API_KEY5,
    // process.env.DEEPSEEK_API_KEY6,
  ];
  
  while (true) {
    try {
      const i = Math.floor(Math.random() * 7);
      const n = Math.floor(Math.random() * 12);
      console.log(`Model: ${models[i]}`);
      console.log(`Api Key: ${apiKeys[n]}`);
      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: models[i],
          messages: [
            {
              role: 'user',
              content: `Rewrite the following product title in natural English.
                        Do a few things:
                        1. Rephrase the wording naturally.
                        2. Change the order of the first 2-3 words so the title starts differently.
                        3. Keep the title nearly as long as the original to include most keywords.
                        4. Make this version distinct from other possible rephrasings. Start differently than your first idea.

                        Return only the new title itself, with no explanations, quotes, or extra text.

                        Original: ${originalTitle}
                  `
            }
          ],
          //temperature: 2
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKeys[0]}`,
            'Content-Type': 'application/json'
          }
        }
      );
      //console.log(`Response: ${response}`)

      console.log(`Response data: ${JSON.stringify(response.data.choices[0].message.content, null, 2)}`)
    
      return response.data.choices[0].message.content

    } catch (error: any) {
      if (retries < maxRetries) {
        retries++
        console.log(`Retrying openRouter request, attempt: ${retries}`)
        await delay(10000 + Math.random() * 2000);
      } else {
        throw error;
      }
    }
  }
}


export function getWeight(amazonProduct: AmazonProduct) {
  function extractWeight(input: string): number | null {
    const weightMatch = input.trim().match(/;\s*(\d+(?:\.\d+)?)\s*(g|kg)/i);

    if (!weightMatch) {
      return 0; 
    }

    const value = parseFloat(weightMatch[1]);
    const unit = weightMatch[2].toLowerCase();

    if (unit === 'g') {
      return value / 1000; 
    } else if (unit === 'kg') {
      return value; 
    }
    return 0; 
  }

  if (amazonProduct) {
    if (amazonProduct.product_information.item_weight) {
      return parseFloat(amazonProduct.product_information.item_weight.replace(',', '.').replace(/[^0-9.+-eE]/g, '')) / 1000
    }

    if (amazonProduct.product_information.package_dimensions) {
      return extractWeight(amazonProduct.product_information.package_dimensions)
    }

    if (amazonProduct.product_information.product_dimensions) {
      return extractWeight(amazonProduct.product_information.product_dimensions)
    }
    return 0;
  }
}

export function removeBrand(text: string, amazonProduct: AmazonProduct) {
  let textWithoutManufacturer = '';
  let textWithoutInfoBrand = '';
  let textWithoutBrand = '';
  let clearedText = '';

  function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function removeWord(text: string, phrase: string): string {
    if (!phrase || !phrase.trim()) return text;

    const escapedPhrase = escapeRegex(phrase.trim());
  
    const regex = new RegExp(
      `(?<!\\w)${escapedPhrase}(?!\\w)`, 
      'gi'
    );

    return text
      .replace(regex, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
    

  if (amazonProduct !== null) {
    //console.log(`Processing to clear brand from text: ${text}`)
    if (amazonProduct.product_information.manufacturer) {
      const productManufacturer = amazonProduct.product_information.manufacturer
      //console.log(`Product manufacturer: ${productManufacturer}`)
      textWithoutManufacturer = removeWord(text, productManufacturer)
      //console.log(`Text without manufacturer: ${clearedText}`)
    } else {
      textWithoutManufacturer = text;
    }

    if (amazonProduct.product_information.brand) {
      const productInfoBrand = amazonProduct.product_information.brand
      //console.log(`Product manufacturer: ${productManufacturer}`)
      textWithoutInfoBrand = removeWord(textWithoutManufacturer, productInfoBrand)
      //console.log(`Text without manufacturer: ${clearedText}`)
    } else {
      textWithoutInfoBrand = textWithoutManufacturer;
    }

    if (amazonProduct.brand) {
      const productBrand = amazonProduct.brand.slice(7)
      console.log(`Product brand: ${productBrand}`)
      textWithoutBrand = removeWord(textWithoutInfoBrand, productBrand)
    } else {
      textWithoutBrand = textWithoutInfoBrand;
    }   
    return textWithoutBrand
  }
}


export async function buildDescription(productDescriptionBrandless: string | undefined, amazonProduct: AmazonProduct) {
  let description: any = '';
  description = productDescriptionBrandless;
  // if (!productDescriptionBrandless) {

  // }
  if (amazonProduct.product_information.package_dimensions) {
    console.log('importing product with description and package dimensions')
    console.log(`Package dimensions: ${amazonProduct.product_information.package_dimensions}`)
    return `
      <p>${description}</p>
      <p>Package dimension: ${amazonProduct.product_information.package_dimensions}</p>
    `
  }

  if (amazonProduct.product_information.product_dimensions) {
    return `
    <p>${description}</p>
    <p>Product dimension: ${amazonProduct.product_information.product_dimensions}</p>
    `
  }
  return `<p>${description}</p>`
}
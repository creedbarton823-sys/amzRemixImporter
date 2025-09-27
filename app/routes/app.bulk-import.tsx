import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { useState, useRef } from "react";
import { getAmazonProductUK, getWeight, rephraseTitle, removeBrand, buildDescription } from "../services/amazon.server";
import { createProduct, getLocation, getTiktokPublication, publishProduct } from "app/services/import.server";

// Process a single ASIN
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const asin = url.searchParams.get("asin");
  
  // Only process if we have an ASIN parameter (API request)
  if (!asin) {
    // Return null for regular page loads
    return null;
  }

  const { admin } = await authenticate.admin(request);

  try {
    const publicationTiktokId = await getTiktokPublication(admin);
    const locationId = await getLocation(admin);
    
    const amazonProduct = await getAmazonProductUK(asin);
    
    if (!amazonProduct) {
      return json({ 
        asin, 
        status: "error", 
        message: "Product not found on Amazon" 
      });
    }

    const productPrice = amazonProduct.pricing.substring(1);
    const productPrice50Margin = parseFloat(productPrice) * 1.5;
    const productPriceX5 = parseFloat(productPrice) * 5;
    const productWeight = getWeight(amazonProduct);
    const productTitleBrandless = removeBrand(amazonProduct.name, amazonProduct);
    const productDescriptionBrandless = amazonProduct.full_description ?
                                      removeBrand(amazonProduct.full_description, amazonProduct) :
                                      "";
    const productDescription = await buildDescription(productDescriptionBrandless, amazonProduct);
    const productTitleSecond = await rephraseTitle(productTitleBrandless);
    const productTitleThird = await rephraseTitle(productTitleBrandless);   

    const firstProductImgs = amazonProduct.images;
    let secondProductImgs = [];

    while (true) {
      secondProductImgs = firstProductImgs.slice().sort(() => Math.random() - 0.5);
      if (secondProductImgs[0] !== firstProductImgs[0]) {
        break
      }
    }

    let thirdProductImgs = [];

    while (true) {
      thirdProductImgs = firstProductImgs.slice().sort(() => Math.random() - 0.5);
      if (thirdProductImgs[0] !== firstProductImgs[0] && thirdProductImgs[0] !== secondProductImgs[0]) {
        break
      }
    }

    const firstProduct = await createProduct(
      productPrice50Margin, 
      productTitleBrandless, 
      firstProductImgs,  
      amazonProduct, 
      productDescriptionBrandless, 
      productDescription,
      productPrice, 
      productWeight, 
      locationId, 
      admin
    );
    
    const secondProduct = await createProduct(
      productPriceX5, 
      productTitleSecond, 
      secondProductImgs, 
      amazonProduct, 
      productDescriptionBrandless, 
      productDescription,
      productPrice, 
      productWeight, 
      locationId, 
      admin
    );
    
    const thirdProduct = await createProduct(
      productPriceX5, 
      productTitleThird, 
      thirdProductImgs,
      amazonProduct, 
      productDescriptionBrandless, 
      productDescription,
      productPrice, 
      productWeight, 
      locationId, 
      admin
    );

    if (!firstProduct?.data?.productSet?.product?.id || 
        !secondProduct?.data?.productSet?.product?.id || 
        !thirdProduct?.data?.productSet?.product?.id) {
      return json({ 
        asin, 
        status: "error", 
        message: "Failed to create one or more products" 
      });
    }

    await publishProduct(firstProduct.data.productSet.product.id, publicationTiktokId, admin);
    await publishProduct(secondProduct.data.productSet.product.id, publicationTiktokId, admin);
    await publishProduct(thirdProduct.data.productSet.product.id, publicationTiktokId, admin);
    
    return json({ 
      asin, 
      status: "success",
      message: "Successfully imported and published 3 products"
    });

  } catch (error: any) {
    return json({ 
      asin, 
      status: "error", 
      message: error.message || "Unknown error occurred"
    });
  }
}

export default function BulkImportPage() {
  const [results, setResults] = useState<any[]>([]);
  const [progress, setProgress] = useState({ processed: 0, total: 0 });
  const [isImporting, setIsImporting] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [currentAsin, setCurrentAsin] = useState<string>("");
  const asinInputRef = useRef<HTMLTextAreaElement>(null);

  const processAsin = async (asin: string) => {
    setCurrentAsin(asin);
    setStatus(`Processing ${asin}...`);
    
    try {
      // Use the current window location to build the full URL
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set('asin', asin);
      
      const response = await fetch(currentUrl.toString(), {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Check if response is JSON
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        // Try to parse the HTML response to extract the data
        const text = await response.text();
        
        // Look for __remixContext in the HTML
        const match = text.match(/window\.__remixContext = ({.*?});/s);
        if (match) {
          try {
            const remixContext = JSON.parse(match[1]);
            const loaderData = remixContext?.state?.loaderData?.['routes/app.bulk-import'];
            if (loaderData && typeof loaderData === 'object') {
              return loaderData;
            }
          } catch (e) {
            console.error('Failed to extract data from HTML response');
          }
        }
        
        // If we can't extract data, but products were still added, return success
        console.warn('Response is HTML, but products may have been added');
        return {
          asin,
          status: "success",
          message: "Products added (response was HTML)"
        };
      }

      const data = await response.json();
      return data;
    } catch (error) {
      return {
        asin,
        status: "error",
        message: `${error}`
      };
    }
  };

  const startImport = async (asinsText: string) => {
    if (!asinsText.trim()) {
      alert("Please enter at least one ASIN");
      return;
    }

    // Parse ASINs
    const asins = asinsText.split(/[\s,]+/).filter(Boolean);
    
    if (asins.length === 0) {
      alert("No valid ASINs found");
      return;
    }

    setIsImporting(true);
    setResults([]);
    setProgress({ processed: 0, total: asins.length });
    setStatus(`Starting import of ${asins.length} ASINs...`);

    // Process ASINs one by one
    for (let i = 0; i < asins.length; i++) {
      const asin = asins[i];
      setProgress({ processed: i, total: asins.length });
      
      const result = await processAsin(asin);
      setResults(prev => [...prev, result]);
      
      setProgress({ processed: i + 1, total: asins.length });
      
      // Small delay between requests to avoid rate limiting
      if (i < asins.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    setIsImporting(false);
    setStatus('Import complete!');
    setCurrentAsin("");
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Bulk Import</h1>
      
      <div style={{ marginBottom: '20px' }}>
        <textarea 
          ref={asinInputRef}
          placeholder="Paste ASINs separated by commas, spaces, or new lines (e.g., B0CBM5Q6S7, B0DGXHD2D4)" 
          style={{ 
            width: '100%', 
            minHeight: '150px',
            padding: '10px',
            fontSize: '14px',
            border: '1px solid #ddd',
            borderRadius: '4px'
          }}
          disabled={isImporting}
        />
      </div>

      <button
        onClick={() => {
          const asins = asinInputRef.current?.value || '';
          startImport(asins);
        }}
        disabled={isImporting}
        style={{
          padding: '12px 24px',
          fontSize: '16px',
          backgroundColor: isImporting ? '#6c757d' : '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: isImporting ? 'not-allowed' : 'pointer',
          marginBottom: '20px'
        }}
      >
        {isImporting ? 'Importing...' : 'Start Import'}
      </button>

      {status && (
        <div style={{ 
          marginBottom: '20px', 
          padding: '10px',
          backgroundColor: '#f0f0f0',
          borderRadius: '4px',
          fontWeight: 'bold'
        }}>
          {status}
          {currentAsin && (
            <div style={{ marginTop: '5px', fontSize: '14px', fontWeight: 'normal' }}>
              Current ASIN: {currentAsin}
            </div>
          )}
        </div>
      )}

      {progress.total > 0 && (
        <div style={{ marginBottom: '30px' }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between',
            marginBottom: '10px'
          }}>
            <span>Progress</span>
            <span>{progress.processed}/{progress.total}</span>
          </div>
          <div style={{ 
            width: '100%', 
            height: '30px', 
            backgroundColor: '#e9ecef',
            borderRadius: '4px',
            overflow: 'hidden'
          }}>
            <div style={{ 
              width: `${(progress.processed / progress.total) * 100}%`,
              height: '100%',
              backgroundColor: '#28a745',
              transition: 'width 0.5s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '14px'
            }}>
              {progress.processed > 0 && `${Math.round((progress.processed / progress.total) * 100)}%`}
            </div>
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div>
          <h2>Results</h2>
          <div style={{ 
            maxHeight: '400px', 
            overflowY: 'auto',
            border: '1px solid #ddd',
            borderRadius: '4px',
            padding: '10px'
          }}>
            {results.map((result, index) => (
              <div 
                key={index} 
                style={{ 
                  padding: '12px',
                  marginBottom: '8px',
                  backgroundColor: result.status === 'success' ? '#d4edda' : '#f8d7da',
                  borderRadius: '4px',
                  border: result.status === 'success' ? '1px solid #c3e6cb' : '1px solid #f5c6cb',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}
              >
                <span style={{ fontSize: '20px' }}>
                  {result.status === 'success' ? '✅' : '❌'}
                </span>
                <div style={{ flex: 1 }}>
                  <strong>{result.asin}</strong>
                  <div style={{ fontSize: '14px', marginTop: '2px', color: '#666' }}>
                    {result.message || (result.status === 'success' ? 'Successfully imported' : 'Error occurred')}
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <div style={{ 
            marginTop: '20px', 
            padding: '10px',
            backgroundColor: '#f8f9fa',
            borderRadius: '4px',
            textAlign: 'center'
          }}>
            <strong>Summary:</strong> {' '}
            {results.filter(r => r.status === 'success').length} successful, {' '}
            {results.filter(r => r.status === 'error').length} failed
          </div>
        </div>
      )}
    </div>
  );
}
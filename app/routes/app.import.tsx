import { useState } from "react";
import { json, type ActionFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useNavigation } from "@remix-run/react";
import {
  Page,
  Card,
  TextField,
  Button,
  Banner,
  BlockStack,
} from "@shopify/polaris";

import { authenticate } from "../shopify.server";
import { getAmazonProductUK, getWeight, rephraseTitle, removeBrand, buildDescription} from "../services/amazon.server";
import { createProduct, getLocation, getTiktokPublication, publishProduct } from "app/services/import.server";
import { build } from "vite";

export async function action({ request }: ActionFunctionArgs) {
  const { admin } = await authenticate.admin(request);

  const form = await request.formData();
  const asin = (form.get("asin") as string)?.trim();

  if (!asin || asin.length !== 10) {
    return json({ error: "Please enter a valid 10-character ASIN" }, { status: 400 });
  }

  const amazonProduct = await getAmazonProductUK(asin);

  if (!amazonProduct) {
    return json({ error: "Could not fetch product from Amazon UK" }, { status: 404 });
  }
  
  const publicationTiktokId = await getTiktokPublication(admin);
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
  const locationId = await getLocation(admin);

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

  const firstProduct = await createProduct(productPrice50Margin, productTitleBrandless, firstProductImgs, amazonProduct, productDescriptionBrandless, productDescription, productPrice, productWeight, locationId, admin);
  const secondProduct = await createProduct(productPriceX5, productTitleSecond, secondProductImgs, amazonProduct, productDescriptionBrandless, productDescription, productPrice, productWeight, locationId, admin);
  const thirdProduct = await createProduct(productPriceX5, productTitleThird, thirdProductImgs, amazonProduct, productDescriptionBrandless, productDescription, productPrice, productWeight, locationId, admin);

  await publishProduct(firstProduct?.data.productSet.product.id, publicationTiktokId, admin);
  await publishProduct(secondProduct?.data.productSet.product.id, publicationTiktokId, admin);
  await publishProduct(thirdProduct?.data.productSet.product.id, publicationTiktokId, admin);

  if (firstProduct) {
    return json({
      success: true,
      asin,
      shopifyId: firstProduct.data.productSet.product.id,
      title: firstProduct.data.productSet.product.title,
      price: amazonProduct.pricing,
    });
  }
}

export default function ImportPage() {
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const busy = nav.state === "submitting";
  const [asin, setAsin] = useState("");

  const handleAsinChange = (value: string) => {
    setAsin(value);
  };
  

  return (
    <Page title="Amazon UK Importer">
      <Card roundedAbove="sm">
        <Form method="post">
          <BlockStack gap="400">
            <TextField
              label="Amazon UK ASIN"
              name="asin"
              value={asin}
              onChange={handleAsinChange}
              autoComplete="off"
              placeholder="B0BSHF7WHW"
            />
            <Button submit loading={busy}>
              {busy ? "Importing..." : "Import product"}
            </Button>
          </BlockStack>
        </Form>
      </Card>

      {actionData && "error" in actionData && (
        <Banner tone="critical" title="Error">
          <p>{actionData.error}</p>
        </Banner>
      )}

      {actionData && "success" in actionData && (
        <Banner tone="success" title="Imported!">
          <p>
            {actionData.title} ({actionData.price}) <br />
            Shopify ID: {actionData.shopifyId}
          </p>
        </Banner>
      )}
    </Page>
  );
}
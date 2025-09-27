import { AmazonProduct } from "./amazon.server";


export async function createProduct(
  price: number, 
  title: string | undefined, 
  productImages: string[], 
  amazonProduct: AmazonProduct, 
  productDescriptionBrandless: string | undefined, 
  productDescription: any,
  productPrice: string, 
  productWeight: number | null | undefined,  
  locationId: string, 
  admin: any
  ) {
    let images = productImages;

    const mutation = `
      mutation populateProduct($input: ProductSetInput!) {
        productSet(input: $input) {
          product {
            id
            title
            descriptionHtml
            media(first: 10) {
              nodes {
                id
                alt
                mediaContentType
                status
              }
            }     
          }
          userErrors {
            field
            message
          }
        }
      }
    `;
  
    if (amazonProduct) {
      const variables = {
        input: {
          title: title,
          descriptionHtml: productDescription
            ? productDescription
            : "",
          productOptions: [
            {
              name: "Title",
              values: [{"name":  "Default Title"}]
            }
          ],
          files: images.map(url => ({
            originalSource: url,
            alt: "product image",
            contentType: "IMAGE"
          })),
          variants: [
            {
              optionValues: [
                {
                  optionName: "Title",
                  name: "Default Title"
                }
              ],
              price: price,
              sku: amazonProduct.product_information.asin,
              inventoryItem: {
                cost: productPrice,
                measurement: {
                  weight: {
                    unit: "KILOGRAMS",
                    value: productWeight
                  }
                },
                tracked: true
              },
              inventoryQuantities: {
                name: "available",
                quantity: 50,
                locationId: locationId
              }
            }
          ],
          vendor: "generic"
        }
      }

      const productCreateResponse = await admin.graphql(mutation, { variables });
      const productCreateResult = await productCreateResponse.json();
      return productCreateResult;
    } 
  }

export async function getTiktokPublication(admin: any) {
  const publicationResponse = await admin.graphql(`
    query {
      publications(first: 10) {
        edges {
          node {
            id
            catalog {
              status
              title
            }
          }
        }
      }
    }`
  )

  const publicationResult = await publicationResponse.json();
  const publications = publicationResult.data.publications.edges;
  return publications[publications.length - 1].node.id;
}

export async function getLocation(admin: any) {
  const locationIdResponse = await admin.graphql(`
    query {
      locations(first: 10, includeLegacy: false) {
        edges {
          node {
            id
            name
          }
        }
      }
    }`
  )

  const locationIdResult = await locationIdResponse.json();
  return locationIdResult.data.locations.edges[0].node.id;
}

export async function publishProduct(productId: string, publicationTiktokId: string, admin: any) {
  const mutation = `
    mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $input) {
        publishable {
          availablePublicationsCount {
            count
          }
          resourcePublicationsCount {
            count
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `

  const variables = {
    id: productId,
    input: {
      publicationId: publicationTiktokId
    }
  }

  await admin.graphql(mutation, { variables })
}
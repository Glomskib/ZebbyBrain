import { Router } from "express";
import rateLimit from "express-rate-limit";
import { FF } from "../config/flags";

const router = Router();
router.use(rateLimit({ windowMs: 60_000, max: 30 }));

async function graphqlQuery(query: string, variables: any) {
  const storeDomain = process.env.SHOPIFY_STORE_DOMAIN;
  const storefrontToken = process.env.SHOPIFY_STOREFRONT_TOKEN;

  if (!storeDomain || !storefrontToken) {
    throw new Error("Shopify configuration missing");
  }

  const response = await fetch(
    `https://${storeDomain}/api/2024-07/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": storefrontToken,
      },
      body: JSON.stringify({ query, variables }),
    }
  );

  return response.json();
}

router.get("/products", async (req, res) => {
  if (!FF.SHOPIFY) {
    return res.status(404).json({ error: "Feature disabled" });
  }

  try {
    const { cursor, collection } = req.query as any;

    const query = `
      query($cursor: String, $handle: String) {
        collectionByHandle(handle: $handle) {
          id
          title
        }
        products(first: 20, after: $cursor, query: $handle) {
          edges {
            cursor
            node {
              id
              handle
              title
              descriptionHtml
              featuredImage {
                url
                altText
              }
              priceRange {
                minVariantPrice {
                  amount
                  currencyCode
                }
              }
            }
          }
          pageInfo {
            hasNextPage
          }
        }
      }
    `;

    const data = await graphqlQuery(query, {
      cursor: cursor || null,
      handle: collection || null,
    });

    res.set("Cache-Control", "no-store");
    return res.json(data);
  } catch (error) {
    console.error("Shopify products error:", error);
    return res.status(500).json({ error: "Failed to fetch products" });
  }
});

router.get("/product/:handle", async (req, res) => {
  if (!FF.SHOPIFY) {
    return res.status(404).json({ error: "Feature disabled" });
  }

  try {
    const { handle } = req.params;

    const query = `
      query($handle: String!) {
        productByHandle(handle: $handle) {
          id
          handle
          title
          descriptionHtml
          images(first: 5) {
            edges {
              node {
                url
                altText
              }
            }
          }
          variants(first: 10) {
            edges {
              node {
                id
                title
                priceV2 {
                  amount
                  currencyCode
                }
                availableForSale
              }
            }
          }
        }
      }
    `;

    const data = await graphqlQuery(query, { handle });

    res.set("Cache-Control", "no-store");
    return res.json(data);
  } catch (error) {
    console.error("Shopify product error:", error);
    return res.status(500).json({ error: "Failed to fetch product" });
  }
});

export default router;

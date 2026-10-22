import { access } from "node:fs/promises"
import { createReadStream } from "node:fs"
import path from "node:path"
import { pipeline } from "node:stream/promises"
import pgCopyStreams from "pg-copy-streams"
import { Client } from "pg"
import "dotenv/config"

const { from: copyFrom } = pgCopyStreams
const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error("DATABASE_URL must be set in packages/db/.env")
}

const datasetDirectory = path.resolve(
  process.cwd(),
  process.env.TOROB_DATASET_DIR ?? "../../dataset"
)

const imports = [
  {
    file: "shops.csv",
    table: "shops",
    columns:
      "address, category_names, contacts, instagram, lat, location_label, lon, name, payment_options, shop_id, supports_fast_delivery, website_url, weekly_hours",
  },
  {
    file: "products.csv",
    table: "products",
    columns:
      "brand_name, category_name, image_urls, model, persian_title, product_id, specs",
  },
  {
    file: "offers.csv",
    table: "offers",
    columns:
      "description, last_price_changed_at, offer_id, price_toman, product_id, seller_title, shop_id, warranty",
  },
]

const client = new Client({ connectionString })
await client.connect()

let transactionStarted = false

try {
  await client.query("BEGIN")
  transactionStarted = true

  for (const { file, table, columns } of imports) {
    const filePath = path.join(datasetDirectory, file)
    await access(filePath)

    const copyQuery = `COPY ${table} (${columns}) FROM STDIN WITH (FORMAT csv, HEADER true, NULL 'null')`
    await pipeline(
      createReadStream(filePath),
      client.query(copyFrom(copyQuery))
    )
    process.stdout.write(`Imported ${file}\n`)
  }

  await client.query("COMMIT")
  transactionStarted = false
} catch (error) {
  if (transactionStarted) {
    await client.query("ROLLBACK")
  }

  throw error
} finally {
  await client.end()
}

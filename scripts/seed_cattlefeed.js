require('dotenv').config();
const pool = require('../utils/db');
const https = require('https');

// BunnyCDN Configuration provided by user
const BUNNY_CONFIG = {
    storageZone: 'cly-bunny',
    storageRegion: 'storage.bunnycdn.com',
    pullZoneUrl: 'https://cly-pull-bunny.b-cdn.net',
    apiKey: '22cfd8b3-8021-40a3-b100a9d48bc0-7dc3-4654'
};

// Helper: Upload Buffer/File to BunnyCDN via HTTP PUT
function uploadToBunnyCDN(fileName, fileBuffer) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: BUNNY_CONFIG.storageRegion,
            path: `/${BUNNY_CONFIG.storageZone}/cattlefeed/${fileName}`,
            method: 'PUT',
            headers: {
                'AccessKey': BUNNY_CONFIG.apiKey,
                'Content-Type': 'image/svg+xml',
                'Content-Length': fileBuffer.length
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 201 || res.statusCode === 200) {
                    const cdnUrl = `${BUNNY_CONFIG.pullZoneUrl}/cattlefeed/${fileName}`;
                    console.log(`✓ Uploaded ${fileName} -> ${cdnUrl}`);
                    resolve(cdnUrl);
                } else {
                    reject(new Error(`BunnyCDN upload failed (${res.statusCode}): ${data}`));
                }
            });
        });

        req.on('error', (err) => reject(err));
        req.write(fileBuffer);
        req.end();
    });
}

// Generate SVG Image for Cattle Feed Product
function generateCattleFeedSVG(productName, badgeText, bgGradientStart, bgGradientEnd) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="500" height="500">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${bgGradientStart}" />
      <stop offset="100%" stop-color="${bgGradientEnd}" />
    </linearGradient>
    <linearGradient id="bagGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#fff8e7" />
      <stop offset="100%" stop-color="#f3e5ab" />
    </linearGradient>
    <linearGradient id="badgeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#d97706" />
      <stop offset="100%" stop-color="#b45309" />
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="8" stdDeviation="10" flood-opacity="0.25" />
    </filter>
  </defs>

  <!-- Background -->
  <rect width="500" height="500" rx="30" fill="url(#bgGrad)" />

  <!-- Background Grain Pattern Overlay -->
  <circle cx="80" cy="90" r="4" fill="#ffffff" opacity="0.2" />
  <circle cx="420" cy="110" r="6" fill="#ffffff" opacity="0.15" />
  <circle cx="400" cy="400" r="5" fill="#ffffff" opacity="0.2" />
  <circle cx="90" cy="380" r="7" fill="#ffffff" opacity="0.15" />

  <!-- Feed Bag Shadow -->
  <ellipse cx="250" cy="440" rx="140" ry="25" fill="#000000" opacity="0.3" filter="url(#shadow)" />

  <!-- Cattle Feed Bag Shape -->
  <path d="M150 140 Q 250 120 350 140 L 370 410 Q 250 435 130 410 Z" fill="url(#bagGrad)" filter="url(#shadow)" stroke="#d97706" stroke-width="4" />
  
  <!-- Stitched Top Seal -->
  <path d="M 140 140 L 360 140" stroke="#92400e" stroke-width="8" stroke-dasharray="10 5" stroke-linecap="round" />
  <rect x="135" y="125" width="230" height="15" rx="5" fill="#78350f" opacity="0.3" />

  <!-- Brand Label Ribbon -->
  <rect x="160" y="170" width="180" height="50" rx="8" fill="#15803d" />
  <text x="250" y="195" font-family="Arial, sans-serif" font-weight="900" font-size="18" fill="#ffffff" text-anchor="middle">CHACHAJI BRAND</text>
  <text x="250" y="212" font-family="Arial, sans-serif" font-weight="700" font-size="11" fill="#fef08a" text-anchor="middle">PREMIUM PASHU AAHAR</text>

  <!-- Product Title Label -->
  <rect x="155" y="235" width="190" height="95" rx="10" fill="#ffffff" stroke="#e5e7eb" stroke-width="2" />
  <text x="250" y="265" font-family="Arial, sans-serif" font-weight="800" font-size="15" fill="#1e293b" text-anchor="middle">${productName.split(' ')[0]} ${productName.split(' ')[1] || ''}</text>
  <text x="250" y="285" font-family="Arial, sans-serif" font-weight="700" font-size="13" fill="#047857" text-anchor="middle">${productName.split(' ').slice(2, 5).join(' ')}</text>
  <text x="250" y="305" font-family="Arial, sans-serif" font-weight="600" font-size="11" fill="#64748b" text-anchor="middle">${productName.split(' ').slice(5).join(' ') || 'High Quality Feed'}</text>

  <!-- Badge Seal -->
  <rect x="175" y="345" width="150" height="30" rx="15" fill="url(#badgeGrad)" />
  <text x="250" y="365" font-family="Arial, sans-serif" font-weight="800" font-size="12" fill="#ffffff" text-anchor="middle">${badgeText}</text>

  <!-- Quality Stamp Icon -->
  <circle cx="320" cy="180" r="22" fill="#f59e0b" stroke="#ffffff" stroke-width="3" />
  <text x="320" y="184" font-family="Arial, sans-serif" font-weight="900" font-size="10" fill="#ffffff" text-anchor="middle">100%</text>
  <text x="320" y="193" font-family="Arial, sans-serif" font-weight="700" font-size="7" fill="#ffffff" text-anchor="middle">PURE</text>
</svg>`;
}

// 20 Cattle Feed Products List with Variation Specifications
const CATTLE_FEED_PRODUCTS = [
    {
        name: 'Chachaji High Milk Yield Pashu Aahar',
        brand: 'Chachaji',
        unit: 'Kg',
        badge: 'MILK BOOSTER',
        bgStart: '#1e3a8a',
        bgEnd: '#3b82f6',
        description: 'Premium balanced dairy cattle feed formulation designed to maximize milk volume and fat percentage in lactating cows.',
        variations: [
            { attributes: { Size: '25kg Bag' }, sku: 'CF-HMY-25', reg: 950, sale: 880, stock: 120 },
            { attributes: { Size: '50kg Bag' }, sku: 'CF-HMY-50', reg: 1800, sale: 1650, stock: 85 },
            { attributes: { Size: '100kg Jumbo Pack' }, sku: 'CF-HMY-100', reg: 3500, sale: 3200, stock: 40 }
        ]
    },
    {
        name: 'Chachaji Special Dairy Cattle Pellets',
        brand: 'Chachaji',
        unit: 'Kg',
        badge: 'ENERGY PELLETS',
        bgStart: '#065f46',
        bgEnd: '#10b981',
        description: 'Highly digestible steam-cooked pellets enriched with essential proteins and bypass fats for daily dairy feeding.',
        variations: [
            { attributes: { Size: '25kg Bag' }, sku: 'CF-SDC-25', reg: 920, sale: 850, stock: 100 },
            { attributes: { Size: '50kg Bag' }, sku: 'CF-SDC-50', reg: 1750, sale: 1600, stock: 90 },
            { attributes: { Size: '100kg Jumbo Pack' }, sku: 'CF-SDC-100', reg: 3400, sale: 3100, stock: 50 }
        ]
    },
    {
        name: 'Chachaji Calf Growth Starter Feed',
        brand: 'Chachaji',
        unit: 'Kg',
        badge: 'CALF GROWTH',
        bgStart: '#854d0e',
        bgEnd: '#f59e0b',
        description: 'Specially formulated starter mash for young calves to accelerate rumen development and early body growth.',
        variations: [
            { attributes: { Size: '20kg Pack' }, sku: 'CF-CGS-20', reg: 850, sale: 780, stock: 75 },
            { attributes: { Size: '50kg Bag' }, sku: 'CF-CGS-50', reg: 1950, sale: 1800, stock: 60 }
        ]
    },
    {
        name: 'Chachaji Bypass Fat Cattle Supplement',
        brand: 'Chachaji',
        unit: 'Kg',
        badge: 'BYPASS FAT',
        bgStart: '#831843',
        bgEnd: '#ec4899',
        description: 'Rumen-protected bypass fat supplement to improve negative energy balance and boost milk butterfat percentage.',
        variations: [
            { attributes: { Size: '10kg Bucket' }, sku: 'CF-BPF-10', reg: 1200, sale: 1100, stock: 50 },
            { attributes: { Size: '25kg Bag' }, sku: 'CF-BPF-25', reg: 2800, sale: 2550, stock: 40 }
        ]
    },
    {
        name: 'Chachaji Mineral Mixture Cattle Feed',
        brand: 'Chachaji',
        unit: 'Kg',
        badge: 'CHELATED MINERALS',
        bgStart: '#4c1d95',
        bgEnd: '#8b5cf6',
        description: 'Area-specific chelated mineral mixture enriched with Vitamins A, D3, and E to prevent nutritional deficiencies.',
        variations: [
            { attributes: { Size: '5kg Pack' }, sku: 'CF-MMC-05', reg: 450, sale: 399, stock: 150 },
            { attributes: { Size: '25kg Bag' }, sku: 'CF-MMC-25', reg: 2100, sale: 1900, stock: 70 }
        ]
    },
    {
        name: 'Chachaji Sugarcane Molasses Cattle Feed',
        brand: 'Chachaji',
        unit: 'Kg',
        badge: 'MOLASSES RICH',
        bgStart: '#7c2d12',
        bgEnd: '#ea580c',
        description: 'Sweet, highly palatable molasses-infused feed pellets providing instant carbohydrate energy for draft and milch cattle.',
        variations: [
            { attributes: { Size: '25kg Bag' }, sku: 'CF-SMC-25', reg: 880, sale: 820, stock: 110 },
            { attributes: { Size: '50kg Bag' }, sku: 'CF-SMC-50', reg: 1650, sale: 1520, stock: 80 }
        ]
    },
    {
        name: 'Chachaji Maize Flake Cattle Feed',
        brand: 'Chachaji',
        unit: 'Kg',
        badge: 'STEAM FLAKED',
        bgStart: '#713f12',
        bgEnd: '#eab308',
        description: 'Steam-flaked yellow maize providing enhanced starch gelatinization for maximum energy absorption.',
        variations: [
            { attributes: { Size: '25kg Bag' }, sku: 'CF-MFC-25', reg: 980, sale: 910, stock: 95 },
            { attributes: { Size: '50kg Bag' }, sku: 'CF-MFC-50', reg: 1880, sale: 1750, stock: 65 }
        ]
    },
    {
        name: 'Chachaji Mustard Cake Cattle Feed',
        brand: 'Chachaji',
        unit: 'Kg',
        badge: 'SARSON KHALI',
        bgStart: '#365314',
        bgEnd: '#84cc16',
        description: 'Traditional cold-pressed mustard oil cake (Sarson Khali) high in crude protein and natural digestive oils.',
        variations: [
            { attributes: { Size: '25kg Bag' }, sku: 'CF-MCC-25', reg: 1050, sale: 980, stock: 130 },
            { attributes: { Size: '50kg Bag' }, sku: 'CF-MCC-50', reg: 2000, sale: 1890, stock: 90 }
        ]
    },
    {
        name: 'Chachaji Cottonseed Cake Cattle Feed',
        brand: 'Chachaji',
        unit: 'Kg',
        badge: 'BINOLA KHALI',
        bgStart: '#134e4a',
        bgEnd: '#14b8a6',
        description: 'Premium decorticated cottonseed cake (Binola Khali) ideal for increasing milk fat content in buffaloes.',
        variations: [
            { attributes: { Size: '25kg Bag' }, sku: 'CF-CCC-25', reg: 1100, sale: 1020, stock: 115 },
            { attributes: { Size: '50kg Bag' }, sku: 'CF-CCC-50', reg: 2150, sale: 1980, stock: 75 }
        ]
    },
    {
        name: 'Chachaji Wheat Bran Cattle Feed',
        brand: 'Chachaji',
        unit: 'Kg',
        badge: 'WHEAT CHOKER',
        bgStart: '#78350f',
        bgEnd: '#d97706',
        description: 'High-fiber wheat choker bran promoting healthy rumen fermentation and preventing digestive constipation.',
        variations: [
            { attributes: { Size: '25kg Bag' }, sku: 'CF-WBC-25', reg: 780, sale: 720, stock: 140 },
            { attributes: { Size: '50kg Bag' }, sku: 'CF-WBC-50', reg: 1480, sale: 1350, stock: 100 }
        ]
    },
    {
        name: 'Chachaji Soybean Meal Cattle Feed',
        brand: 'Chachaji',
        unit: 'Kg',
        badge: 'SOY KHALI',
        bgStart: '#431407',
        bgEnd: '#c2410c',
        description: 'De-oiled soybean meal (Soy Khali) packed with 46% crude protein for high-producing dairy herds.',
        variations: [
            { attributes: { Size: '25kg Bag' }, sku: 'CF-SMC-25B', reg: 1350, sale: 1250, stock: 80 },
            { attributes: { Size: '50kg Bag' }, sku: 'CF-SMC-50B', reg: 2600, sale: 2400, stock: 55 }
        ]
    },
    {
        name: 'Chachaji Calcium & Phosphorus Cattle Feed',
        brand: 'Chachaji',
        unit: 'Kg',
        badge: 'BONE & MILK BOOST',
        bgStart: '#0f172a',
        bgEnd: '#64748b',
        description: 'Liquid and granule calcium-phosphorus supplement fortified with Vitamin D3 for strong bone structure and high milk yield.',
        variations: [
            { attributes: { Size: '5L Can' }, sku: 'CF-CPC-05', reg: 650, sale: 580, stock: 90 },
            { attributes: { Size: '20L Drum' }, sku: 'CF-CPC-20', reg: 2400, sale: 2200, stock: 45 }
        ]
    },
    {
        name: 'Chachaji Silage Enriched Cattle Feed',
        brand: 'Chachaji',
        unit: 'Kg',
        badge: 'GREEN FODDER MIX',
        bgStart: '#14532d',
        bgEnd: '#22c55e',
        description: 'Fermented green fodder silage pellets rich in organic acids, lactobacillus, and succulence.',
        variations: [
            { attributes: { Size: '30kg Bale' }, sku: 'CF-SEC-30', reg: 850, sale: 790, stock: 85 },
            { attributes: { Size: '60kg Pack' }, sku: 'CF-SEC-60', reg: 1600, sale: 1480, stock: 60 }
        ]
    },
    {
        name: 'Chachaji Organic Herbal Cattle Feed',
        brand: 'Chachaji',
        unit: 'Kg',
        badge: 'AYUSH HERBAL',
        bgStart: '#064e3b',
        bgEnd: '#34d399',
        description: '100% natural organic feed blended with traditional herbs like Shatavari, Ashwagandha, and Jivanti for immunity and stamina.',
        variations: [
            { attributes: { Size: '25kg Bag' }, sku: 'CF-OHC-25', reg: 1150, sale: 1050, stock: 70 },
            { attributes: { Size: '50kg Bag' }, sku: 'CF-OHC-50', reg: 2200, sale: 2000, stock: 50 }
        ]
    },
    {
        name: 'Chachaji High Fat Buffalo Special Feed',
        brand: 'Chachaji',
        unit: 'Kg',
        badge: 'BUFFALO FAT BOOST',
        bgStart: '#312e81',
        bgEnd: '#6366f1',
        description: 'Special high-energy dense formulation specifically tailored for Murrah and indigenous buffalo milk fat enhancement.',
        variations: [
            { attributes: { Size: '25kg Bag' }, sku: 'CF-HFB-25', reg: 1080, sale: 990, stock: 110 },
            { attributes: { Size: '50kg Bag' }, sku: 'CF-HFB-50', reg: 2050, sale: 1890, stock: 80 }
        ]
    },
    {
        name: 'Chachaji Dry Cow Maintenance Feed',
        brand: 'Chachaji',
        unit: 'Kg',
        badge: 'PRE-CALVING',
        bgStart: '#701a75',
        bgEnd: '#d946ef',
        description: 'Anionic salt enriched transition feed for pregnant dry cows to prevent post-calving milk fever and retained placenta.',
        variations: [
            { attributes: { Size: '25kg Bag' }, sku: 'CF-DCM-25', reg: 990, sale: 920, stock: 65 },
            { attributes: { Size: '50kg Bag' }, sku: 'CF-DCM-50', reg: 1900, sale: 1780, stock: 45 }
        ]
    },
    {
        name: 'Chachaji Probiotic Cattle Feed',
        brand: 'Chachaji',
        unit: 'Kg',
        badge: 'GUT HEALTH',
        bgStart: '#1e293b',
        bgEnd: '#0284c7',
        description: 'Contains live yeast cultures and probiotics to stabilize rumen pH, prevent acidosis, and enhance feed conversion efficiency.',
        variations: [
            { attributes: { Size: '25kg Bag' }, sku: 'CF-PCF-25', reg: 1020, sale: 940, stock: 90 },
            { attributes: { Size: '50kg Bag' }, sku: 'CF-PCF-50', reg: 1980, sale: 1820, stock: 60 }
        ]
    },
    {
        name: 'Chachaji Rice Bran Extractions Feed',
        brand: 'Chachaji',
        unit: 'Kg',
        badge: 'DE-OILED RICE BRAN',
        bgStart: '#713f12',
        bgEnd: '#ca8a04',
        description: 'De-oiled rice bran (DORB) providing high crude fiber and metabolic energy for cattle diet balancing.',
        variations: [
            { attributes: { Size: '25kg Bag' }, sku: 'CF-RBE-25', reg: 720, sale: 660, stock: 150 },
            { attributes: { Size: '50kg Bag' }, sku: 'CF-RBE-50', reg: 1380, sale: 1250, stock: 100 }
        ]
    },
    {
        name: 'Chachaji Multi-Grain Cattle Mash',
        brand: 'Chachaji',
        unit: 'Kg',
        badge: 'MULTI-GRAIN MASH',
        bgStart: '#881337',
        bgEnd: '#f43f5e',
        description: 'Coarsely ground multi-grain mash combining barley, oats, corn, and pulses for wholesome natural nutrition.',
        variations: [
            { attributes: { Size: '25kg Bag' }, sku: 'CF-MGM-25', reg: 940, sale: 870, stock: 105 },
            { attributes: { Size: '50kg Bag' }, sku: 'CF-MGM-50', reg: 1820, sale: 1680, stock: 75 }
        ]
    },
    {
        name: 'Chachaji Heavy Milking Cattle Formula',
        brand: 'Chachaji',
        unit: 'Kg',
        badge: 'SUPER LACTATION',
        bgStart: '#14532d',
        bgEnd: '#16a34a',
        description: 'Ultra-premium high-yield formula for cows producing 20+ liters of milk daily, enriched with amino acids and chelates.',
        variations: [
            { attributes: { Size: '25kg Bag' }, sku: 'CF-HMC-25', reg: 1250, sale: 1150, stock: 85 },
            { attributes: { Size: '50kg Bag' }, sku: 'CF-HMC-50', reg: 2400, sale: 2200, stock: 60 }
        ]
    }
];

async function seedCattleFeedProducts() {
    console.log('🚀 Starting Cattle Feed Products Seeding with BunnyCDN Uploads...');

    try {
        // 1. Ensure "Cattle Feed & Livestock Nutrition" Category exists
        const [existingCats] = await pool.query("SELECT * FROM categories WHERE slug = 'cattle-feed-livestock'");
        let categoryId;

        if (existingCats.length > 0) {
            categoryId = existingCats[0].id;
            console.log(`✓ Category "Cattle Feed & Livestock Nutrition" exists (ID: ${categoryId})`);
        } else {
            const [catResult] = await pool.query(
                "INSERT INTO categories (name, slug, description) VALUES (?, ?, ?)",
                ['Cattle Feed & Livestock Nutrition', 'cattle-feed-livestock', 'High quality cattle feed, pashu aahar, mineral mixtures, and dairy supplements']
            );
            categoryId = catResult.insertId;
            console.log(`✓ Created Category "Cattle Feed & Livestock Nutrition" (ID: ${categoryId})`);
        }

        let insertedCount = 0;

        // 2. Loop through 20 Cattle Feed Products
        for (let i = 0; i < CATTLE_FEED_PRODUCTS.length; i++) {
            const item = CATTLE_FEED_PRODUCTS[i];
            const fileName = `cattlefeed_${i + 1}_${Date.now()}.svg`;

            // Generate SVG Image Buffer
            const svgText = generateCattleFeedSVG(item.name, item.badge, item.bgStart, item.bgEnd);
            const svgBuffer = Buffer.from(svgText, 'utf-8');

            console.log(`\nUploading image ${i + 1}/20: ${item.name}...`);
            const cdnImageUrl = await uploadToBunnyCDN(fileName, svgBuffer);

            // Main Product Parent SKU
            const parentSku = item.variations[0].sku.replace(/-\d+$/, '');

            // Insert into products table as VARIABLE
            const [prodResult] = await pool.query(
                `INSERT INTO products (
                    category_id, name, slug, sku, brand, unit, type, regular_price, sale_price,
                    stock_quantity, stock_status, is_active, primary_image, short_description, description
                ) VALUES (?, ?, ?, ?, ?, ?, 'VARIABLE', ?, ?, ?, 'in_stock', 1, ?, ?, ?)`,
                [
                    categoryId,
                    item.name,
                    item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                    parentSku,
                    item.brand,
                    item.unit,
                    item.variations[0].reg,
                    item.variations[0].sale,
                    item.variations.reduce((sum, v) => sum + v.stock, 0),
                    cdnImageUrl,
                    item.description,
                    `${item.description} Formulated by Chachaji Brand experts using 100% natural ingredients to boost dairy productivity.`
                ]
            );

            const productId = prodResult.insertId;

            // Insert Variations into product_variations table
            for (const varItem of item.variations) {
                await pool.query(
                    `INSERT INTO product_variations (
                        product_id, sku, regular_price, sale_price, stock_quantity, stock_status, attributes, is_active
                    ) VALUES (?, ?, ?, ?, ?, 'in_stock', ?, 1)`,
                    [
                        productId,
                        varItem.sku,
                        varItem.reg,
                        varItem.sale,
                        varItem.stock,
                        JSON.stringify(varItem.attributes)
                    ]
                );
            }

            insertedCount++;
            console.log(`✓ Seeded Product #${insertedCount}: ${item.name} with ${item.variations.length} variations!`);
        }

        console.log(`\n🎉 SUCCESS! All ${insertedCount} Cattle Feed VARIABLE products seeded cleanly with BunnyCDN images.`);
        process.exit(0);
    } catch (err) {
        console.error('❌ Error during Cattle Feed seeding:', err);
        process.exit(1);
    }
}

seedCattleFeedProducts();

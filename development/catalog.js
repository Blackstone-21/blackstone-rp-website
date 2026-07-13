window.BLACKSTONE_DEVELOPMENT_CONFIG = Object.freeze({
  brand: {
    storeUrl: "https://blackstone-rp-development.tebex.store",
    discordUrl: "https://discord.gg/bqHJqCFC7E",
    supportServer: "Blackstone RP Discord"
  },

  products: [
    {
      slug: "blackstone-trucker-job",
      aliases: ["blackstone trucker", "trucker job", "trucking"],
      title: "Blackstone Trucker Job",
      category: "Jobs & Activities",
      frameworks: ["QBCore", "Qbox"],
      dependencies: ["ox_lib", "oxmysql", "qb-banking or compatible banking"],
      tags: ["Progression", "Economy", "Owned Trucks"],
      version: "1.0.0",
      updatedAt: "2026-07-13",
      status: "New",
      performance: "Designed around event-driven job stages and distance-aware client checks.",
      installationDifficulty: "Intermediate",
      description: "A complete trucking career with 30 progression levels, contracts, rentals, owned trucks, upgrades and port-based operations.",
      features: [
        "Thirty balanced progression levels",
        "Contract and experience system",
        "Different truck and trailer combinations",
        "Rental or personally owned truck selection",
        "Truck purchasing and upgrade progression",
        "Port-based tablet, garage and contract terminal",
        "Banking integration support",
        "Configurable payouts, routes and unlocks"
      ],
      installation: [
        "Install the listed dependencies before the resource.",
        "Import the included SQL file into the server database.",
        "Place the resource in the server resources folder.",
        "Configure framework, banking and vehicle settings.",
        "Add ensure blackstone_trucker after its dependencies.",
        "Restart the server and complete a test contract."
      ],
      configuration: [
        "Framework and banking bridge",
        "Contract payout multipliers",
        "Experience and level thresholds",
        "Rental deposits and return rules",
        "Truck prices and upgrade costs",
        "Job terminal, garage and delivery locations"
      ],
      troubleshooting: [
        "Confirm oxmysql starts before the trucker resource.",
        "Check that all configured vehicle spawn names exist.",
        "Verify the banking resource name and exported functions.",
        "Use the server console error when opening a support ticket."
      ],
      changelog: [
        {
          version: "1.0.0",
          date: "2026-07-13",
          type: "Release",
          changes: [
            "Added 30-level trucking progression.",
            "Added rentals, owned trucks and upgrade support.",
            "Added port terminal workflow and configurable banking bridge."
          ]
        }
      ]
    },
    {
      slug: "blackstone-scrapyard",
      aliases: ["scrapyard", "scrap yard", "scrapping"],
      title: "Blackstone Scrapyard",
      category: "Jobs & Activities",
      frameworks: ["QBCore", "Qbox"],
      dependencies: ["ox_lib", "oxmysql", "inventory bridge"],
      tags: ["Materials", "Jobs", "Progression"],
      version: "1.0.0",
      updatedAt: "2026-07-13",
      status: "New",
      performance: "Zone and interaction checks are restricted to active scrapyard areas.",
      installationDifficulty: "Easy",
      description: "A material-focused scrapyard activity with repeatable jobs, configurable rewards and server-economy integration.",
      features: [
        "Configurable scrapyard job stages",
        "Material and item reward tables",
        "Randomised work points",
        "Inventory compatibility layer",
        "Server-side reward validation",
        "Cooldown and anti-spam controls"
      ],
      installation: [
        "Install the listed framework and inventory dependencies.",
        "Place the resource in the resources folder.",
        "Configure item names to match the server inventory.",
        "Add the resource after its dependencies in server.cfg.",
        "Restart and verify each work stage."
      ],
      configuration: [
        "Scrapyard locations and interaction zones",
        "Material reward ranges",
        "Job cooldowns",
        "Inventory bridge",
        "Required tools and animations"
      ],
      troubleshooting: [
        "Confirm every configured reward item exists.",
        "Verify the selected inventory bridge.",
        "Check target or interaction dependency start order."
      ],
      changelog: [
        {
          version: "1.0.0",
          date: "2026-07-13",
          type: "Release",
          changes: [
            "Added configurable scrapyard work loop.",
            "Added randomised material rewards.",
            "Added performance-focused zone activation."
          ]
        }
      ]
    },
    {
      slug: "blackstone-chopshop",
      aliases: ["chopshop", "chop shop", "car jacking", "carjacking"],
      title: "Blackstone Chop Shop",
      category: "Crime",
      frameworks: ["QBCore", "Qbox"],
      dependencies: ["ox_lib", "oxmysql", "police alert bridge"],
      tags: ["Vehicle Theft", "Police Alerts", "Materials"],
      version: "1.0.0",
      updatedAt: "2026-07-13",
      status: "New",
      performance: "Mission logic runs only for active contracts with server-authoritative completion checks.",
      installationDifficulty: "Intermediate",
      description: "Vehicle theft and dismantling contracts with delivery locations, police alerts and configurable rewards.",
      features: [
        "Random vehicle theft contracts",
        "Dismantling interaction sequence",
        "Configurable police alert bridge",
        "Sonoran CAD integration-ready alert hooks",
        "Material and cash rewards",
        "Contract cooldown and validation",
        "Random delivery locations"
      ],
      installation: [
        "Install framework, database and interaction dependencies.",
        "Configure the police alert or Sonoran CAD bridge.",
        "Review vehicle lists and delivery locations.",
        "Add the resource to server.cfg after dependencies.",
        "Test a complete contract with police online."
      ],
      configuration: [
        "Contract vehicles and reward tiers",
        "Police count requirements",
        "Alert probability and timing",
        "Dismantling locations",
        "Cooldowns and anti-exploit checks"
      ],
      troubleshooting: [
        "Confirm the alert bridge is enabled and named correctly.",
        "Verify every configured vehicle model is valid.",
        "Check police job names against the server framework."
      ],
      changelog: [
        {
          version: "1.0.0",
          date: "2026-07-13",
          type: "Release",
          changes: [
            "Added vehicle theft contracts and dismantling.",
            "Added configurable police and CAD alerts.",
            "Added server-side contract validation."
          ]
        }
      ]
    },
    {
      slug: "blackstone-vehicle-insurance",
      aliases: ["vehicle insurance", "insurance"],
      title: "Blackstone Vehicle Insurance",
      category: "Vehicle Systems",
      frameworks: ["QBCore", "Qbox"],
      dependencies: ["oxmysql", "vehicle ownership database"],
      tags: ["Ownership", "Economy", "Claims"],
      version: "1.0.0",
      updatedAt: "2026-07-13",
      status: "New",
      performance: "Insurance state is persisted server-side and queried only when required.",
      installationDifficulty: "Intermediate",
      description: "Persistent vehicle insurance policies, pricing, expiry and claim workflows for a more complete vehicle economy.",
      features: [
        "Persistent vehicle insurance policies",
        "Configurable premiums and policy periods",
        "Coverage validation",
        "Claim and replacement workflow hooks",
        "Owned vehicle database integration",
        "Administrative policy controls"
      ],
      installation: [
        "Back up the owned vehicle database.",
        "Import the included insurance SQL migration.",
        "Configure the owned vehicle table and plate fields.",
        "Set premium and expiry rules.",
        "Start the resource after the framework and database."
      ],
      configuration: [
        "Vehicle pricing classes",
        "Premium calculation",
        "Policy duration",
        "Claim rules",
        "Database table mapping"
      ],
      troubleshooting: [
        "Check the owned vehicle table and plate-column mapping.",
        "Confirm plates are normalised consistently.",
        "Verify the SQL migration completed successfully."
      ],
      changelog: [
        {
          version: "1.0.0",
          date: "2026-07-13",
          type: "Release",
          changes: [
            "Added persistent vehicle policies.",
            "Added configurable premium and expiry rules.",
            "Added ownership database bridge."
          ]
        }
      ]
    },
    {
      slug: "blackstone-speed-cameras",
      aliases: ["speed camera", "speed cameras", "anpr", "point to point"],
      title: "Blackstone Speed Camera Network",
      category: "Police & Emergency",
      frameworks: ["QBCore", "Qbox", "Standalone"],
      dependencies: ["ox_lib", "optional CAD bridge"],
      tags: ["ANPR", "Point-to-Point", "Traffic"],
      version: "0.9.0",
      updatedAt: "2026-07-13",
      status: "Coming Soon",
      performance: "Camera checks use localised zones and server-authoritative offence validation.",
      installationDifficulty: "Advanced",
      description: "A planned ANPR, fixed-camera and point-to-point enforcement network with configurable placement rules.",
      features: [
        "Fixed speed camera support",
        "Point-to-point average speed checks",
        "ANPR event hooks",
        "Traffic-light placement rules",
        "Configurable infringement handling",
        "Automatic prop placement planning"
      ],
      installation: [
        "Install the required interaction and framework bridge.",
        "Configure camera zones and enforcement rules.",
        "Set the infringement or police alert integration.",
        "Test each camera corridor before production use."
      ],
      configuration: [
        "Camera positions and headings",
        "Speed thresholds",
        "Point-to-point route distances",
        "ANPR alert rules",
        "Traffic-light exclusion radius"
      ],
      troubleshooting: [
        "Verify every camera coordinate is on the intended road.",
        "Confirm route start and end identifiers are unique.",
        "Check server time and plate formatting consistency."
      ],
      changelog: [
        {
          version: "0.9.0",
          date: "2026-07-13",
          type: "Development",
          changes: [
            "Prepared fixed, ANPR and point-to-point system design.",
            "Added configurable camera placement model.",
            "Prepared CAD integration hooks."
          ]
        }
      ]
    },
    {
      slug: "blackstone-hud",
      aliases: ["hud", "blackstone hud"],
      title: "Blackstone Optimised HUD",
      category: "Interface",
      frameworks: ["QBCore", "Qbox", "Standalone"],
      dependencies: ["NUI"],
      tags: ["HUD", "Vehicle UI", "Optimised"],
      version: "0.9.0",
      updatedAt: "2026-07-13",
      status: "Coming Soon",
      performance: "NUI updates are rate-limited and values are only sent when state changes.",
      installationDifficulty: "Easy",
      description: "A compact circular status and vehicle HUD designed to stay clear of the minimap and reduce unnecessary NUI work.",
      features: [
        "Compact circular status indicators",
        "Player health, armour, hunger and thirst",
        "Stamina shown from 100 downward",
        "Vehicle speed, fuel and engine state",
        "No large background panel",
        "State-change-based NUI updates"
      ],
      installation: [
        "Place the resource in the server resources folder.",
        "Select the framework or standalone bridge.",
        "Configure HUD position and enabled indicators.",
        "Disable any conflicting HUD resource.",
        "Start the Blackstone HUD."
      ],
      configuration: [
        "Screen position and scale",
        "Enabled player indicators",
        "Vehicle display units",
        "Framework status events",
        "Update intervals"
      ],
      troubleshooting: [
        "Disable the original framework HUD to avoid duplicates.",
        "Confirm status event names match the framework.",
        "Clear the FiveM NUI cache after major visual changes."
      ],
      changelog: [
        {
          version: "0.9.0",
          date: "2026-07-13",
          type: "Development",
          changes: [
            "Prepared compact circular HUD design.",
            "Added vehicle-state layout.",
            "Reduced update frequency using state-change checks."
          ]
        }
      ]
    },
    {
      slug: "blackstone-spotify-player",
      aliases: ["spotify", "music player", "car stereo"],
      title: "Blackstone Music Player",
      category: "Entertainment",
      frameworks: ["QBCore", "Qbox", "Standalone"],
      dependencies: ["NUI", "audio provider integration"],
      tags: ["Music", "Vehicle Audio", "NUI"],
      version: "0.8.0",
      updatedAt: "2026-07-12",
      status: "Coming Soon",
      performance: "Playback state is scoped to active listeners and vehicle occupants.",
      installationDifficulty: "Advanced",
      description: "A planned in-game music interface with personal playback controls and synchronised vehicle stereo support.",
      features: [
        "In-game music interface",
        "Personal playback controls",
        "Vehicle stereo synchronisation",
        "Volume and listener range controls",
        "Driver permission settings",
        "Configurable provider bridge"
      ],
      installation: [
        "Configure the supported audio-provider credentials securely.",
        "Install the NUI and audio dependencies.",
        "Set vehicle listener and permission rules.",
        "Never place private provider secrets in client files."
      ],
      configuration: [
        "Audio provider",
        "Vehicle listener radius",
        "Default volume",
        "Driver and passenger permissions",
        "Playback restrictions"
      ],
      troubleshooting: [
        "Confirm provider callback URLs match the deployed configuration.",
        "Keep private API secrets on the server.",
        "Check browser audio restrictions and NUI console errors."
      ],
      changelog: [
        {
          version: "0.8.0",
          date: "2026-07-12",
          type: "Development",
          changes: [
            "Prepared personal player and vehicle stereo design.",
            "Added synchronised listener model.",
            "Prepared secure provider authentication flow."
          ]
        }
      ]
    }
  ],

  bundles: [
    {
      title: "Civilian Jobs Bundle",
      status: "Planned Bundle",
      description: "A combined progression package for servers building a deeper civilian economy.",
      products: ["Blackstone Trucker Job", "Blackstone Scrapyard", "Blackstone Chop Shop"],
      actionLabel: "View Included Products",
      targetView: "products"
    },
    {
      title: "Vehicle Systems Bundle",
      status: "Planned Bundle",
      description: "Vehicle ownership, insurance and enforcement systems designed to work together.",
      products: ["Blackstone Vehicle Insurance", "Blackstone Speed Camera Network", "Blackstone Optimised HUD"],
      actionLabel: "View Included Products",
      targetView: "products"
    }
  ],

  faqs: [
    {
      question: "Where do I receive a purchased script?",
      answer: "Purchases and protected resource entitlement are handled by the official Blackstone Development Tebex store. Use the same Cfx.re account associated with your server."
    },
    {
      question: "Do the scripts support QBCore and Qbox?",
      answer: "Compatibility is listed on every product card and product page. Some resources support both through a bridge, while others may initially target QBCore."
    },
    {
      question: "Can I get help installing a resource?",
      answer: "Yes. Read the product documentation first, then use the Support page to generate a complete installation-help request before opening a Discord ticket."
    },
    {
      question: "Can I share or resell a purchased resource?",
      answer: "No. Access is for the purchasing customer and is subject to the licence and Tebex terms shown with the package."
    },
    {
      question: "Why does a product say Coming Soon?",
      answer: "The product profile has been prepared, but the package is not yet publicly available in the connected website or Tebex catalogue."
    },
    {
      question: "Are customer reviews real?",
      answer: "The hub does not show invented reviews. The review area remains empty until verified Tebex purchase validation is connected."
    }
  ]
});

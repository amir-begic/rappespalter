import "dotenv/config"
import { PrismaLibSql } from "@prisma/adapter-libsql"
import { PrismaClient } from "../generated/prisma/client"

const adapter = new PrismaLibSql({ url: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })
const categories = [
  { name: 'Groceries',        color: '#8ab4d4', type: 'variable' },
  { name: 'Dining & Bars',    color: '#f0c080', type: 'variable' },
  { name: 'Shopping',         color: '#d4857a', type: 'variable' },
  { name: 'Entertainment',    color: '#c5b8d4', type: 'variable' },
  { name: 'Transport',        color: '#6aaa7a', type: 'variable' },
  { name: 'Healthcare',       color: '#a8c5a0', type: 'variable' },
  { name: 'Personal',         color: '#e8a060', type: 'variable' },
  { name: 'Rent',             color: '#8ab4d4', type: 'fixed'    },
  { name: 'Taxes',            color: '#8ab4d4', type: 'fixed'    },
  { name: 'Health Insurance', color: '#8ab4d4', type: 'fixed'    },
  { name: 'Mobile',           color: '#8ab4d4', type: 'fixed'    },
  { name: 'Internet',         color: '#8ab4d4', type: 'fixed'    },
  { name: 'Utilities',        color: '#8ab4d4', type: 'fixed'    },
  { name: 'ETF Investment',   color: '#6aaa7a', type: 'savings'  },
  { name: 'Säule 3a',         color: '#6aaa7a', type: 'savings'  },
  { name: 'Savings Transfer', color: '#6aaa7a', type: 'savings'  },
  { name: 'Salary',           color: '#4caf72', type: 'income'   },
  { name: 'Other Income',     color: '#9b7ec4', type: 'income'   },
  // Money between your own accounts (e.g. a card bill paid from checking);
  // left out of all totals, and rules never move transactions out of it.
  { name: 'Internal Transfer', color: '#9e9e9e', type: 'transfer' },
]

async function main() {
  for (const cat of categories) {
    await prisma.category.upsert({
      where: { name: cat.name },
      update: {},
      create: cat,
    })
  }
  console.log('Categories seeded.')
}

main().catch(console.error).finally(() => prisma.$disconnect())
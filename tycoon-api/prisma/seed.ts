import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface BusinessSeed {
  slug: string;
  name: string;
  baseCost: string;
  costMultiplier: string;
  baseIncome: string;
  sortOrder: number;
}

interface UpgradeSeed {
  slug: string;
  name: string;
  description: string;
  cost: string;
  multiplier: string;
  businessSlug: string | null;
}

const businessesData: BusinessSeed[] = [
  {
    slug: 'lemonade-stand',
    name: 'Barraca de Limonada',
    baseCost: '4.00',
    costMultiplier: '1.0700',
    baseIncome: '1.00',
    sortOrder: 1,
  },
  {
    slug: 'newspaper-delivery',
    name: 'Entrega de Jornais',
    baseCost: '60.00',
    costMultiplier: '1.1500',
    baseIncome: '15.00',
    sortOrder: 2,
  },
  {
    slug: 'car-wash',
    name: 'Lava-Jato Automático',
    baseCost: '720.00',
    costMultiplier: '1.1400',
    baseIncome: '90.00',
    sortOrder: 3,
  },
  {
    slug: 'pizza-delivery',
    name: 'Pizzaria Express',
    baseCost: '8640.00',
    costMultiplier: '1.1300',
    baseIncome: '540.00',
    sortOrder: 4,
  },
  {
    slug: 'tech-startup',
    name: 'Startup de Tecnologia',
    baseCost: '103680.00',
    costMultiplier: '1.1200',
    baseIncome: '3240.00',
    sortOrder: 5,
  },
  {
    slug: 'oil-company',
    name: 'Petrolífera Global',
    baseCost: '1244160.00',
    costMultiplier: '1.1100',
    baseIncome: '19440.00',
    sortOrder: 6,
  },
];

const upgradesData: UpgradeSeed[] = [
  {
    slug: 'organic-lemons',
    name: 'Limões Orgânicos',
    description: 'Triplica o lucro da Barraca de Limonada.',
    cost: '250.00',
    multiplier: '3.00',
    businessSlug: 'lemonade-stand',
  },
  {
    slug: 'electric-bikes',
    name: 'Bicicletas Elétricas',
    description: 'Triplica o lucro da Entrega de Jornais.',
    cost: '2500.00',
    multiplier: '3.00',
    businessSlug: 'newspaper-delivery',
  },
  {
    slug: 'carnauba-wax',
    name: 'Cera de Carnaúba Premium',
    description: 'Triplica o lucro do Lava-Jato Automático.',
    cost: '15000.00',
    multiplier: '3.00',
    businessSlug: 'car-wash',
  },
  {
    slug: 'turbo-wood-oven',
    name: 'Forno a Lenha Turbo',
    description: 'Triplica o lucro da Pizzaria Express.',
    cost: '120000.00',
    multiplier: '3.00',
    businessSlug: 'pizza-delivery',
  },
  {
    slug: 'cloud-clusters',
    name: 'Servidores em Nuvem',
    description: 'Triplica o lucro da Startup de Tecnologia.',
    cost: '1500000.00',
    multiplier: '3.00',
    businessSlug: 'tech-startup',
  },
  {
    slug: 'management-consulting',
    name: 'Consultoria de Gestão',
    description: 'Dobra o lucro de TODOS os negócios.',
    cost: '50000.00',
    multiplier: '2.00',
    businessSlug: null,
  },
  {
    slug: 'global-holding',
    name: 'Holding Internacional',
    description: 'Triplica o lucro de TODOS os negócios.',
    cost: '5000000.00',
    multiplier: '3.00',
    businessSlug: null,
  },
];

async function main() {
  console.log('Iniciando seed do catálogo do Tycoon...');

  const businessMap = new Map<string, number>();

  for (const item of businessesData) {
    const business = await prisma.business.upsert({
      where: { slug: item.slug },
      update: {
        name: item.name,
        baseCost: item.baseCost,
        costMultiplier: item.costMultiplier,
        baseIncome: item.baseIncome,
        sortOrder: item.sortOrder,
      },
      create: item,
    });

    businessMap.set(business.slug, business.id);
  }

  for (const item of upgradesData) {
    const businessId = item.businessSlug
      ? businessMap.get(item.businessSlug) ?? null
      : null;

    if (item.businessSlug && businessId === null) {
      throw new Error(`Negócio não encontrado para o upgrade: ${item.slug}`);
    }

    await prisma.upgrade.upsert({
      where: { slug: item.slug },
      update: {
        name: item.name,
        description: item.description,
        cost: item.cost,
        multiplier: item.multiplier,
        businessId,
      },
      create: {
        slug: item.slug,
        name: item.name,
        description: item.description,
        cost: item.cost,
        multiplier: item.multiplier,
        businessId,
      },
    });
  }

  console.log(
    `Seed concluído: ${businessesData.length} negócios e ${upgradesData.length} upgrades sincronizados.`
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error('Erro ao executar seed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
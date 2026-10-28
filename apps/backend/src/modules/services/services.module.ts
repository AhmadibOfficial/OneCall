import { Controller, Get, Module, Query } from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PrismaModule, PrismaService } from '@/infrastructure/database/prisma';
import { cityKey, NIGERIA_SERVICES, NIGERIA_STATES } from './nigeria';

export const KADUNA_SERVICES = NIGERIA_SERVICES.filter((service) =>
  [
    'tailoring',
    'mechanic',
    'shoe-repair',
    'provisions',
    'soup-ingredients',
    'solar',
    'carpentry',
    'painting',
  ].includes(service.key),
);

class LocationQuery {
  @IsOptional() @IsIn(NIGERIA_STATES) state?: string;
  @IsOptional() @IsString() @MaxLength(60) city?: string;
}

@Controller('services')
class ServicesController {
  constructor(private readonly prisma: PrismaService) {}
  @Get()
  async list(@Query() query: LocationQuery) {
    const state = query.state ?? 'Kaduna';
    const city = query.city?.trim() || (state === 'FCT' ? 'Abuja' : state);
    const areas = await this.prisma.providerCoverage.findMany({
      where: {
        state,
        cityKey: { in: [cityKey(city), '*'] },
        provider: {
          approved: true,
          user: {
            status: 'ACTIVE',
            deletedAt: null,
          },
        },
      },
      select: { serviceName: true, providerId: true },
    });
    const parcelRoutes = await this.prisma.parcelRoute.findMany({
      where: {
        status: 'ACTIVE',
        originAgent: {
          status: 'APPROVED',
          state,
          cityKey: cityKey(city),
          user: {
            status: 'ACTIVE',
            deletedAt: null,
          },
        },
        destinationAgent: {
          status: 'APPROVED',
          user: {
            status: 'ACTIVE',
            deletedAt: null,
          },
        },
      },
      select: { originAgentId: true },
    });
    return {
      country: 'NG',
      state,
      city,
      services: NIGERIA_SERVICES.map((service) => ({
        ...service,
        availableProviders:
          service.key === 'parcel-delivery'
            ? new Set(parcelRoutes.map((route) => route.originAgentId)).size
            : new Set(
                areas
                  .filter((area) => area.serviceName === service.name)
                  .map((area) => area.providerId),
              ).size,
      })),
    };
  }
}

@Controller('locations')
class LocationsController {
  @Get()
  list() {
    return { country: 'NG', countryName: 'Nigeria', states: NIGERIA_STATES };
  }
}

@Module({
  imports: [PrismaModule],
  controllers: [ServicesController, LocationsController],
})
export class ServicesModule {}

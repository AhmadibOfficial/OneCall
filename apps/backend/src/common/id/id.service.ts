import { Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';

@Injectable()
export class IdService {
  generateUserUid(): string {
    return randomInt(1000000000, 10000000000).toString();
  }
}

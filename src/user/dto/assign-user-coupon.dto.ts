import { IsUUID } from 'class-validator';

export class AssignUserCouponDto {
  @IsUUID('4')
  couponId!: string;
}

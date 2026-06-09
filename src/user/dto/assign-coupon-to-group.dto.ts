import { IsUUID } from 'class-validator';

export class AssignCouponToGroupDto {
  @IsUUID('4')
  couponId!: string;
}

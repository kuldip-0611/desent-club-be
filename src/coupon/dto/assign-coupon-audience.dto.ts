import { IsUUID } from 'class-validator';

export class AssignCouponUserDto {
  @IsUUID('4')
  userId!: string;
}

export class AssignCouponUserGroupDto {
  @IsUUID('4')
  userGroupId!: string;
}

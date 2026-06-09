import { IsUUID } from 'class-validator';

export class AddGroupMemberDto {
  @IsUUID('4')
  userId!: string;
}

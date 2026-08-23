import { IsString, Length } from 'class-validator';

export class VerifyDto {
  @IsString()
  @Length(10, 200)
  token!: string;
}

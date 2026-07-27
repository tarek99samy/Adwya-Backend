// import { Module } from '@nestjs/common';
// import { AuthController } from './auth.controller';
// import { AuthService } from './auth.service';
// import { UsersModule } from '../users/users.module';
// import { JwtModule } from '@nestjs/jwt';
// import { ConfigModule, ConfigService } from '@nestjs/config';

// @Module({
//   imports: [
//     ConfigModule.forRoot({
//       envFilePath: '.env',
//       isGlobal: true,
//     }),
//     UsersModule,
//     JwtModule.registerAsync({
//       global: true,
//       imports: [ConfigModule],
//       inject: [ConfigService],
//       useFactory: (configService: ConfigService) => ({
//         secret: configService.get<string>('JWT_SECRET'),
//         signOptions: { expiresIn: '1d' },
//       }),
//     }),
//   ],
//   controllers: [AuthController],
//   providers: [AuthService],
// })
// export class AuthModule {}

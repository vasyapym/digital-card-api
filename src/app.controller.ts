import { Controller, Get, Redirect } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  @Redirect('/graphql', 302)
  redirectToGraphql(): void {}
}

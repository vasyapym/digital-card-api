import { Field, GraphQLISODateTime, ID, ObjectType } from '@nestjs/graphql';

@ObjectType({ description: 'Ссылка на профессиональный ресурс' })
export class Link {
  @Field({ description: 'Название ресурса: GitHub, LinkedIn, Telegram...' })
  label!: string;

  @Field()
  url!: string;
}

@ObjectType({ description: 'Профессиональный навык' })
export class Skill {
  @Field()
  name!: string;

  @Field({ description: 'Категория: Backend, Databases, DevOps...' })
  category!: string;
}

@ObjectType({ description: 'Опыт работы' })
export class Experience {
  @Field()
  company!: string;

  @Field()
  position!: string;

  @Field(() => GraphQLISODateTime)
  startDate!: Date;

  @Field(() => GraphQLISODateTime, { nullable: true, description: 'null — работаю здесь сейчас' })
  endDate!: Date | null;

  @Field(() => [String])
  achievements!: string[];

  @Field(() => String, { nullable: true })
  description!: string | null;

  @Field({ description: 'Работаю здесь сейчас' })
  isCurrent!: boolean;

  @Field(() => Number, { description: 'Длительность в месяцах (включительно)' })
  durationInMonths!: number;
}

@ObjectType({ description: 'Проект' })
export class Project {
  @Field()
  name!: string;

  @Field(() => String, { nullable: true })
  description!: string | null;

  @Field({ description: 'Ссылка на проект (демо, сайт или репозиторий)' })
  url!: string;

  @Field(() => String, { nullable: true })
  repositoryUrl!: string | null;

  @Field(() => [String])
  technologies!: string[];
}

@ObjectType({ description: 'Профиль специалиста' })
export class Profile {
  @Field(() => ID)
  id!: number;

  @Field({ description: 'Человекочитаемый идентификатор профиля' })
  slug!: string;

  @Field()
  name!: string;

  @Field({ description: 'Специализация, например "Backend-разработчик"' })
  title!: string;

  @Field()
  description!: string;

  @Field(() => String, { nullable: true })
  location!: string | null;

  @Field(() => String, { nullable: true })
  email!: string | null;

  @Field(() => [Link])
  links!: Link[];

  skills!: Skill[];

  @Field(() => [Experience])
  experience!: Experience[];

  @Field(() => [Project])
  projects!: Project[];
}

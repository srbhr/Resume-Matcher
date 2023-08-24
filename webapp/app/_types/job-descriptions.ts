export type JobDescription = {
  id: string;
} & (
  | {
      link: string;
      description?: never;
    }
  | {
      description: string;
      link?: never;
    }
);

export interface BlogPost {
  id: number;
  title: string;
  content: string;
  author: string;
  category: string;
  status: string;
  date_created: string;
  picture?: {
    filename_disk: string;
  } | null;
}
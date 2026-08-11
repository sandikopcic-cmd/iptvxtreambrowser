export type XtreamCreds = {
  server: string;
  username: string;
  password: string;
};

export type XtreamAccount = {
  username: string;
  status: string;
  expDate: string | null;
  isTrial: boolean;
  activeConnections: string;
  maxConnections: string;
};

export type Category = { id: string; name: string };

export type LiveChannel = {
  id: string;
  name: string;
  icon: string | null;
  categoryId: string | null;
  epgChannelId: string | null;
  num: number;
};

export type VodItem = {
  id: string;
  name: string;
  icon: string | null;
  categoryId: string | null;
  rating: string | null;
  added: string | null;
  ext: string | null;
};

export type SeriesItem = {
  id: string;
  name: string;
  icon: string | null;
  categoryId: string | null;
  rating: string | null;
  plot: string | null;
};

export type VodDetail = {
  name: string;
  plot: string | null;
  cast: string | null;
  director: string | null;
  genre: string | null;
  releaseDate: string | null;
  rating: string | null;
  duration: string | null;
  cover: string | null;
  ext: string;
};

export type Episode = {
  id: string;
  title: string;
  episodeNum: number;
  season: number;
  ext: string;
  plot: string | null;
  image: string | null;
  duration: string | null;
};

export type SeriesDetail = {
  name: string;
  plot: string | null;
  cast: string | null;
  genre: string | null;
  releaseDate: string | null;
  rating: string | null;
  cover: string | null;
  seasons: { season: number; episodes: Episode[] }[];
};

export type EpgEntry = {
  title: string;
  description: string;
  start: string;
  end: string;
};

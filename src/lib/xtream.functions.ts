import { createServerFn } from "@tanstack/react-start";
import {
  parseAccount,
  parseCategories,
  parseEpg,
  parseLive,
  parseSeriesDetail,
  parseSeriesList,
  parseVod,
  parseVodDetail,
  xtreamApi,
} from "./xtream.server";
import {
  categoriesSchema,
  credsSchema,
  epgSchema,
  seriesInfoSchema,
  vodInfoSchema,
} from "./xtream-schemas";

export const xtreamLogin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => credsSchema.parse(input))
  .handler(async ({ data }) => parseAccount(await xtreamApi(data)));

export const xtreamCategories = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    categoriesSchema.parse(input),
  )
  .handler(async ({ data }) =>
    parseCategories(await xtreamApi(data, { action: `get_${data.kind}_categories` })),
  );

export const xtreamLiveStreams = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => credsSchema.parse(input))
  .handler(async ({ data }) => parseLive(await xtreamApi(data, { action: "get_live_streams" })));

export const xtreamVodStreams = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => credsSchema.parse(input))
  .handler(async ({ data }) => parseVod(await xtreamApi(data, { action: "get_vod_streams" })));

export const xtreamSeriesList = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => credsSchema.parse(input))
  .handler(async ({ data }) => parseSeriesList(await xtreamApi(data, { action: "get_series" })));

export const xtreamVodInfo = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    vodInfoSchema.parse(input),
  )
  .handler(async ({ data }) =>
    parseVodDetail(await xtreamApi(data, { action: "get_vod_info", vod_id: data.vodId })),
  );

export const xtreamSeriesInfo = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    seriesInfoSchema.parse(input),
  )
  .handler(async ({ data }) =>
    parseSeriesDetail(
      await xtreamApi(data, { action: "get_series_info", series_id: data.seriesId }),
    ),
  );

export const xtreamShortEpg = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    epgSchema.parse(input),
  )
  .handler(async ({ data }) =>
    parseEpg(
      await xtreamApi(data, {
        action: "get_short_epg",
        stream_id: data.streamId,
        limit: "4",
      }),
    ),
  );

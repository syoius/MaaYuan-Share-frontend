export interface AdBannerConfigItem {
  image: string;
  link: string;
  alt?: string;
}

// 可在此数组中快速增删改广告项
export const defaultAdBanners: AdBannerConfigItem[] = [
  {
    image: "/mumu.webp",
    link: "https://adl.netease.com/d/g/a11/c/maayuan",
    alt: "MuMu",
  },
  {
    image: "/biubiu.webp",
    link: "https://www.biubiu001.com/?cfrom=maayuan",
    alt: "biubiu",
  },
  {
    image: "/mirror.webp",
    link: "https://mirrorchyan.com/zh/projects?rid=MaaYuan&source=navtop",
    alt: "Mirror",
  },
  {
    image: "/wiki.webp",
    link: "https://wiki.biligame.com/yuan/%E9%A6%96%E9%A1%B5",
    alt: "wiki",
  },
];

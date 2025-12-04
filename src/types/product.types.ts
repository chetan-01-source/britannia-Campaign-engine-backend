export interface Product {
  id?: string;
  name: string;
  description?: string;
  category?: string;
  productUrl: string;
  slug: string;
  images: ProductImages;
  productHighlights?: string[];
  createdAt?: Date;
}

export interface ProductImages {
  primary?: string;
  gallery: string[];
  thumbnails: string[];
}

export interface ApiProduct {
  id: number;
  attributes: ApiProductAttributes;
}

export interface ApiProductAttributes {
  Name: string;
  Slug: string;
  order: number;
  mainProductOption?: ApiProductOption;
  product_options?: {
    data: ApiProductOptionData[];
  };
}

export interface ApiProductOption {
  data: ApiProductOptionData;
}

export interface ApiProductOptionData {
  id: number;
  attributes: {
    Name: string;
    ThumbImage?: ApiImage;
    Images?: {
      data: ApiImageData[];
    };
  };
}

export interface ApiImage {
  data: ApiImageData;
}

export interface ApiImageData {
  id: number;
  attributes: {
    url: string;
    alternativeText?: string;
  };
}

export interface ApiResponse {
  pageProps: {
    products: {
      data: ApiProduct[];
    };
  };
}

export interface ScrapedProductDetails {
  name?: string;
  description?: string;
  images: ProductImages;
  productHighlights?: string[];
}
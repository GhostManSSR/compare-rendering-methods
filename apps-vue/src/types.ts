export type Product = {
  id: number
  title: string
  description: string
  price: number
  rating: number
  brand: string
  category: string
  thumbnail: string
}

export type FeedData = { products: Product[] }

declare global {
  interface Window {
    __INITIAL_FEED__?: FeedData
  }
}

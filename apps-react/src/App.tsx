import { useEffect, useState } from 'react'

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

async function loadFeed(): Promise<FeedData> {
  const response = await fetch(
    '/api/products?limit=12&select=id,title,description,price,rating,brand,category,thumbnail',
  )
  if (!response.ok) throw new Error(`Products API returned ${response.status}`)
  return response.json() as Promise<FeedData>
}

export function App({
  initialFeed,
  mode = 'csr',
  basePath = '',
}: {
  initialFeed?: FeedData
  mode?: string
  basePath?: string
}) {
  const [feed, setFeed] = useState<FeedData | undefined>(initialFeed)
  const [error, setError] = useState('')

  useEffect(() => {
    if (initialFeed) return
    loadFeed().then(setFeed).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : 'Unable to load products')
    })
  }, [initialFeed])

  return (
    <main className="page">
      <header className="topbar">
        <a className="brand" href={`${basePath}/csr`} aria-label="Market home">market<span>lab</span></a>
        <nav aria-label="Rendering modes">
          {['csr', 'ssr', 'ssg'].map((item) => (
            <a className={mode === item ? 'active' : ''} href={`${basePath}/${item}`} key={item}>
              {item.toUpperCase()}
            </a>
          ))}
        </nav>
        <span className="framework">React · {mode.toUpperCase()}</span>
      </header>
      <section className="intro">
        <p className="eyebrow">TODAY'S PICKS · FREE DELIVERY</p>
        <h1>Find your next favorite.</h1>
        <p className="subtitle">Fresh finds from brands you'll love.</p>
      </section>
      {error && <p className="error" role="alert">Could not load the catalog: {error}</p>}
      {!feed && !error && <p className="loading" aria-live="polite">Loading the catalog…</p>}
      {feed && (
        <section className="catalog" aria-label="Marketplace products">
          {feed.products.map((product, index) => (
            <article className="card" key={product.id}>
              <div className="image-wrap">
                <img
                  src={product.thumbnail}
                  alt={product.title}
                  width="320"
                  height="240"
                  loading={index === 0 ? 'eager' : 'lazy'}
                  fetchPriority={index === 0 ? 'high' : 'auto'}
                />
                {index === 0 && <span className="badge">BESTSELLER</span>}
              </div>
              <div className="card-info">
                <p className="category">{product.category}</p>
                <h2>{product.title}</h2>
                <p className="description">{product.description}</p>
                <div className="card-bottom">
                  <strong>${product.price.toFixed(2)}</strong>
                  <span className="rating">★ {product.rating.toFixed(1)}</span>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
      <footer>Same catalog, same images, same viewport — only the render strategy changes.</footer>
    </main>
  )
}

export { loadFeed }

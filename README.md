# Our Daily Quilt Beta

An interactive quilt-building application with image reveal functionality.

## Features

- **Interactive Quilt Building**: Add colors and build beautiful quilt patterns
- **Image Reveal System**: Flip blocks to reveal pieces of a larger image
- **Firebase Integration**: Load reveal images from Firebase Storage
- **Mobile-First Design**: Optimized for touch interactions
- **Local Storage**: Saves your quilt progress locally

## Live Demo

Visit the live version to test the Firebase image reveal feature:
[Live Demo](https://zakfoster921.github.io/our-daily-quilt/)

## Local Development

1. Clone the repository
2. Open `our-daily-beta.html` in a web browser
3. For Firebase image testing, deploy to a live server (GitHub Pages, Netlify, etc.)

## Firebase Setup

The app uses Firebase Storage for reveal images. Images should be stored in the `quilt-reveals` folder.

## Deployment

### GitHub Pages (Recommended)

1. Push to GitHub repository
2. Enable GitHub Pages in repository settings
3. Set source to "Deploy from a branch"
4. Select `main` branch and `/ (root)` folder

### Netlify

1. Drag and drop the project folder to Netlify
2. Or connect your GitHub repository for automatic deployments

## CORS Note

Firebase image loading requires a proper domain (not `file://` or `localhost`). Deploy to a live website to test the full image reveal functionality.

## Admin Access

Use the gear icon in the bottom right to access admin features:
- Manage reveal images
- Force load Firebase images
- Quote management

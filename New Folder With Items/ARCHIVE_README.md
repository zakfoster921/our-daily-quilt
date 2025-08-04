# Our Daily Archive

A mobile-friendly archive page that displays daily quilts with share functionality.

## Features

- **Mobile-First Design**: Responsive layout that works beautifully on all devices
- **Daily Updates**: Automatically loads the latest quilt data from Firebase
- **Share Functionality**: Each quilt entry has a share button that generates Instagram story-friendly images
- **Contributor Count**: Shows how many people contributed to each daily quilt
- **Quote Display**: Each entry shows the daily quote that inspired the quilt
- **Smooth Animations**: Gentle, relaxing animations following the app's design principles

## Files

- `archive.html` - Main archive page
- `archive-styles.css` - Archive-specific styles
- `archive.js` - Archive functionality and data loading
- `update-archive.js` - Script for daily archive updates

## Usage

### Viewing the Archive

1. Navigate to `archive.html` in your browser
2. The page will automatically load the latest quilt data
3. Each entry shows:
   - Date
   - Daily quote and author
   - Quilt image with wavy edges
   - Number of contributors
   - Share button

### Sharing Quilts

1. Click the "Share" button on any quilt entry
2. A modal will open with an Instagram story-friendly image
3. Options:
   - Download the image
   - Copy a link to the specific quilt

### Daily Updates

The archive automatically updates at the end of each day with new quilt data. The update process:

1. Loads today's quilt data from Firebase
2. Calculates contributor count
3. Saves to the archive collection
4. Cleans up old entries (keeps last 30 days)

## Technical Details

### Data Structure

Each archive entry contains:
```javascript
{
  id: "date-string",
  date: "2025-01-15",
  blocks: [...], // Quilt block data
  quote: {
    text: "Quote text",
    author: "— Author Name"
  },
  contributorCount: 42
}
```

### Share Image Format

- **Dimensions**: 1080x1920 (Instagram story ratio)
- **Background**: Gradient matching the app theme
- **Content**: Title, date, quote, quilt image, contributor count, website URL
- **Format**: PNG for high quality

### Mobile Optimization

- Responsive grid layout
- Touch-friendly buttons
- Optimized image loading
- Smooth scrolling
- Accessibility features

## Setup

1. Ensure Firebase is configured in `config.js`
2. The archive will automatically load data from the "quilts" collection
3. For daily updates, set up a cron job to run `update-archive.js`

## Customization

### Adding New Quotes

Edit the `quotes` array in `archive.js`:

```javascript
this.quotes = [
  { text: "Your quote here", author: "— Author Name" },
  // ... more quotes
];
```

### Changing Share Image Style

Modify the `generateShareImage()` method in `archive.js` to customize:
- Colors and fonts
- Layout and spacing
- Background effects
- Text wrapping

### Archive Retention

Adjust the cleanup period in `update-archive.js`:

```javascript
// Change from 30 days to your preferred retention period
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
```

## Browser Support

- Modern browsers with ES6+ support
- Mobile Safari and Chrome
- Desktop Chrome, Firefox, Safari, Edge

## Performance

- Lazy loading of quilt images
- Optimized SVG rendering
- Efficient data queries
- Minimal DOM manipulation

## Accessibility

- ARIA labels and roles
- Keyboard navigation
- Screen reader support
- High contrast mode
- Reduced motion support 
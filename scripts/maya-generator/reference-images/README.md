# Maya Reference Images

This directory should contain 3-5 reference images of Maya for character consistency.

## Why Reference Images?

The Gemini 3 Pro Image API supports character consistency through reference images. By including these images in every API call, Maya will maintain a consistent appearance across all generated images.

## Required Images

Add the following Maya reference images to this directory:

| Filename | Description | Priority |
|----------|-------------|----------|
| `maya-front.png` | Front-facing portrait, clear face visibility | **Required** |
| `maya-three-quarter.png` | 3/4 angle view showing face and profile | **Required** |
| `maya-full-body.png` | Full body shot showing proportions | **Required** |
| `maya-action.png` | Action/gesture pose showing movement style | Recommended |
| `maya-profile.png` | Side profile view | Optional |

## Image Requirements

- **Format**: PNG or JPEG
- **Resolution**: At least 1024x1024 pixels recommended
- **Quality**: High quality, well-lit images
- **Background**: Neutral or transparent backgrounds work best
- **Content**: Clear, unobstructed view of Maya

## Naming Convention

Files should be named with `maya-` prefix and descriptive suffix:
- `maya-front.png`
- `maya-portrait.jpg`
- `maya-three-quarter.png`
- `maya-full-body.png`
- `maya-action.png`

The generator will automatically load and prioritize images based on their names.

## Creating Reference Images

If you don't have existing Maya images, you can:

1. **Generate initial references**: Use the generator without references first, then select the best results to use as references
2. **Use AI image generation**: Create consistent Maya images using another AI tool
3. **Commission artwork**: Have a consistent character design created

## Validation

Run the following to check if your reference images are set up correctly:

```bash
cd scripts/maya-generator
node generate.js --validate
```

This will show:
- Number of reference images found
- Whether the recommended minimum (3) is met
- API key configuration status

## Privacy Note

Reference images are sent to Google's Gemini API for processing. Do not use images containing sensitive or private content.

# Image Studio

The Image Studio is a powerful tool within the Maya administration interface designed for crafting and managing image generation prompts. It provides a user-friendly way to build complex prompts, experiment with variations, and manage the underlying components and series settings that drive AI image creation.

## Key Features

The Image Studio is organized into three main sections, accessible via tabs on desktop or a bottom navigation bar on mobile:

### 1. Playground Tab

This is the primary area for experimenting with image prompts.

*   **Prompt Builder & Settings:**
    *   Dynamically constructs prompts based on predefined `component_types` (e.g., Character Style, Character Details, Clothing, Setting, Art Style).
    *   For each component type, users can:
        *   Select from a list of predefined `ImagePromptComponent` values.
        *   Choose "-- None --" to omit the component.
        *   Choose "-- Manual Input --" to type a custom value for that component.
    *   **Context/Mood ID:** Allows specifying a context or mood ID for the generation, which can be used by the backend.
*   **Constructed Prompt Card:**
    *   Displays the final, assembled prompt string in real-time as components are selected or manually entered.
    *   **Generate Single Image Button:** Submits the constructed prompt to the `series-generator` service to create a single image. The result will appear in the main Activity Feed.
*   **Generate Series from Above Prompt Card:**
    *   Uses the currently constructed prompt as a base.
    *   **Variation Set:** Select a predefined `ImageSeriesVariation` set.
    *   **Apply Variation Types:** Choose specific variation types (e.g., color, angle) from the selected set to apply to the base prompt.
    *   **Generate Series from Prompt Button:** Submits the base prompt along with selected variations to the `series-generator` service to create multiple image variations. These will also appear in the Activity Feed.
*   **Last Generation Attempt Card:**
    *   Shows the most recently submitted prompt (either single or series base).
    *   Provides a quick link to the Activity Feed.

### 2. Prompt Components Tab

This section allows for the management of the individual building blocks used in the Playground's Prompt Builder.

*   **View and Manage `ImagePromptComponent`s:**
    *   Displays a table of all existing image prompt components.
    *   Columns include: Type, Value, Themes, Weight, Active status.
*   **CRUD Operations:**
    *   **Add Component:** Opens a dialog to create a new prompt component with fields for type, value, theme tags (comma-separated), weight, and an active toggle.
    *   **Edit Component:** Opens a dialog to modify an existing component.
    *   **Delete Component:** Removes a component (with a confirmation dialog).
    *   **Toggle Active:** Quickly activate or deactivate a component directly from the table.
*   **Filtering:**
    *   Filter components by "Type" and "Value".
*   **Pagination & Sorting:**
    *   Standard table controls for navigating and sorting the component list.

### 3. Series Variations Tab

This section is dedicated to managing sets of variations that can be applied to base prompts in the Playground.

*   **View and Manage `ImageSeriesVariation`s:**
    *   Displays a table of all existing series variations.
    *   Columns include: Set Name, Type, Value, Applies To (component type), Themes, Active status.
*   **CRUD Operations:**
    *   **Add Variation:** Opens a dialog to create a new series variation. Fields include:
        *   Variation Set Name (groups related variations)
        *   Variation Type (e.g., `color_palette`, `camera_angle`)
        *   Value (the actual variation string, e.g., "warm vibrant colors", "low angle shot")
        *   Description (optional)
        *   Theme Tags (comma-separated, optional)
        *   Weight (optional)
        *   Mutually Exclusive Group (optional, for advanced logic)
        *   Applies To Component Type (optional, if the variation should replace a specific component type)
        *   Active toggle.
    *   **Edit Variation:** Opens a dialog to modify an existing variation.
    *   **Delete Variation:** Removes a variation (with a confirmation dialog).
    *   **Toggle Active:** Quickly activate or deactivate a variation directly from the table.
*   **Filtering:**
    *   Filter variations by "Set Name" and "Type".
*   **Pagination & Sorting:**
    *   Standard table controls for navigating and sorting the variation list.

## Mobile Responsiveness

*   **Desktop:** Uses a tab-based navigation system at the top of the page.
*   **Mobile (max-width: 768px):**
    *   Switches to a fixed bottom navigation bar with icons and text labels for "Playground", "Components", and "Variations" for easy one-handed operation.
    *   The layout of cards and controls adapts to smaller screen sizes.

## Backend Integration

*   **Prompt Structure, Components, and Variations Data:**
    *   Fetched from and managed via API endpoints exposed by the `memory-worker` service (e.g., `/api/v1/image-gen/prompt-structure`, `/api/v1/image-gen/prompt-components`, `/api/v1/image-gen/series-variations`).
*   **Image Generation Requests:**
    *   Both single image and series generation requests are sent to API endpoints on the `series-generator` service (e.g., `/generate-single-image`, `/generate-series-from-components`).

## How to Use

1.  **Configure Building Blocks (Optional but Recommended):**
    *   Navigate to the "Prompt Components" tab to add or modify the basic elements you want to use in your prompts (e.g., different art styles, character features).
    *   Navigate to the "Series Variations" tab to define sets of variations you might want to apply systematically (e.g., a "Lighting" set with variations for "daylight", "night time", "golden hour").
2.  **Build a Prompt in the Playground:**
    *   Go to the "Playground" tab.
    *   Use the "Prompt Builder & Settings" card to select from your predefined components or enter manual values for each part of your desired prompt.
    *   The "Constructed Prompt" card will show you the final prompt as it's being built.
3.  **Generate an Image:**
    *   Once satisfied with the constructed prompt, click the "Generate Single Image" button at the bottom of the "Constructed Prompt" card.
4.  **Generate a Series of Variations:**
    *   After building a base prompt in the Playground:
        *   In the "Generate Series from Above Prompt" card, select a "Variation Set".
        *   Check the "Variation Types" you want to apply from that set.
        *   Click "Generate Series from Prompt".
5.  **View Results:**
    *   All generated images (single or series) will appear in the main "Activity Feed" section of the admin panel once processed by the backend.
    *   The "Last Generation Attempt" card in the Playground provides a quick status and link. 
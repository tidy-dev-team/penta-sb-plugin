import { once, showUI, emit } from "@create-figma-plugin/utilities";

import { CloseHandler, CreateAvatarHandler } from "./types";

export default function () {
  once<CreateAvatarHandler>("CREATE_AVATAR", async function (data) {
    try {
      const { props, componentName } = data;

      // Find the Component Set (not individual components)
      const componentSet = figma.root.findOne(
        (node) => 
          node.type === "COMPONENT_SET" && 
          node.name.toLowerCase() === componentName.toLowerCase()
      ) as ComponentSetNode;

      if (!componentSet) {
        // Debug: show what's available
        const allComponentSets = figma.root.findAll(
          (node) => node.type === "COMPONENT_SET"
        ) as ComponentSetNode[];
        
        const componentSetList = allComponentSets
          .map(c => `• ${c.name}`)
          .join("\n");
        
        figma.notify(
          `❌ Component Set "${componentName}" not found.\n\nAvailable Component Sets:\n${componentSetList || "No component sets found"}`, 
          { error: true, timeout: 10000 }
        );
        return;
      }

      figma.notify(`Found Component Set: ${componentSet.name}`);

      // Get the default variant (first child component)
      const defaultVariant = componentSet.defaultVariant || componentSet.children[0] as ComponentNode;

      if (!defaultVariant || defaultVariant.type !== "COMPONENT") {
        figma.notify("❌ Could not find a variant in the component set", { error: true });
        return;
      }

      // Create an instance of the default variant
      const instance = defaultVariant.createInstance();

      // Position the instance in the center of the viewport
      const viewportCenter = figma.viewport.center;
      instance.x = viewportCenter.x;
      instance.y = viewportCenter.y;

      // Get available properties from the component
      const availableProps = Object.keys(instance.componentProperties || {});
      console.log("Available component properties:", availableProps);

      // Map common prop names to Figma component properties
      // These match your Figma component's actual property names
      const propertyMapping: Record<string, string> = {
        size: "size",
        type: "type",
        shape: "shape",
        outline: "outline",
        lowerBadge: "lower badge",
        upperBadge: "upper badge",
        initials: "initials",
        "✏️ label": "label", // For button label
        "icon L": "icon L",   // For button left icon
        "icon R": "icon R",   // For button right icon
      };

      // Separate TEXT properties from other properties
      // TEXT properties need special handling - we update the text node directly
      const propertiesToSet: Record<string, any> = {};
      const textPropertiesToSet: Record<string, string> = {};
      let imageUrl: string | null = null;
      
      for (const [propKey, propValue] of Object.entries(props)) {
        // Special handling for imageUrl
        if (propKey === "imageUrl") {
          imageUrl = String(propValue);
          console.log(`Found imageUrl: ${imageUrl}`);
          continue;
        }

        const figmaPropertyName = propertyMapping[propKey];
        
        if (figmaPropertyName) {
          // Find the actual property name in Figma (it might have emoji/variable ID suffix)
          // e.g., "initials" might be stored as "✏️ initials#262:0"
          let actualPropertyName: string | null = null;
          
          // First, try exact match
          if (availableProps.includes(figmaPropertyName)) {
            actualPropertyName = figmaPropertyName;
          } else {
            // Try to find by matching the base name (ignoring emoji and variable ID)
            // Look for properties that contain our property name
            for (const availableProp of availableProps) {
              // Remove emoji and variable ID suffix (e.g., "✏️ initials#262:0" -> "initials")
              const baseName = availableProp.replace(/^[^\w]*/, '').split('#')[0].trim();
              if (baseName.toLowerCase() === figmaPropertyName.toLowerCase()) {
                actualPropertyName = availableProp;
                break;
              }
            }
          }
          
          if (actualPropertyName) {
            const propDef = instance.componentProperties[actualPropertyName];
            if (propDef && propDef.type === "TEXT") {
              textPropertiesToSet[actualPropertyName] = String(propValue);
              console.log(`Found TEXT property: "${actualPropertyName}" (mapped from "${figmaPropertyName}")`);
            } else {
              propertiesToSet[actualPropertyName] = propValue;
            }
          } else {
            console.warn(`Property "${figmaPropertyName}" not found in available properties`);
          }
        } else {
          console.warn(`No mapping found for prop key: "${propKey}"`);
        }
      }

      // Set non-text properties first
      if (Object.keys(propertiesToSet).length > 0) {
        try {
          instance.setProperties(propertiesToSet);
          console.log("Set non-text properties:", propertiesToSet);
        } catch (error) {
          console.error("Property setting error:", error);
        }
      }

      // Handle TEXT properties by updating text nodes directly
      // Don't use setProperties() for TEXT - update the text node instead
      if (Object.keys(textPropertiesToSet).length > 0) {
        const instanceTextNodes = instance.findAll(node => node.type === "TEXT") as TextNode[];
        
        console.log(`Found ${instanceTextNodes.length} text node(s) in instance`);
        console.log("Text properties to set:", textPropertiesToSet);
        
        if (instanceTextNodes.length === 0) {
          console.error("No text nodes found in instance");
          figma.notify("⚠️ No text nodes found in component", { timeout: 3000 });
        } else {
          // For each text property, find and update the corresponding text node
          for (const [propName, propValue] of Object.entries(textPropertiesToSet)) {
            console.log(`Looking for text node for property "${propName}" with value "${propValue}"`);
            
            let targetTextNode: TextNode | null = null;
            
            // Strategy 1: If there's only one text node, use it
            if (instanceTextNodes.length === 1) {
              targetTextNode = instanceTextNodes[0];
              console.log("Using single text node");
            } else {
              // Strategy 2: Find text node with bound variable (indicates it's bound to a property)
              for (const textNode of instanceTextNodes) {
                const boundVar = textNode.boundVariables?.characters;
                if (boundVar) {
                  console.log(`Found text node with bound variable: ${boundVar.id}`);
                  targetTextNode = textNode;
                  break;
                }
              }
              
              // Strategy 3: If multiple text properties, try to match by checking main component
              if (!targetTextNode && instanceTextNodes.length > 0) {
                const mainComponent = instance.mainComponent;
                if (mainComponent) {
                  const mainTextNodes = mainComponent.findAll(node => node.type === "TEXT") as TextNode[];
                  console.log(`Found ${mainTextNodes.length} text node(s) in main component`);
                  
                  // Match by position/index
                  if (mainTextNodes.length === instanceTextNodes.length) {
                    // If counts match, use first one (common case: single text property)
                    if (Object.keys(textPropertiesToSet).length === 1) {
                      targetTextNode = instanceTextNodes[0];
                      console.log("Using first text node (matched by count)");
                    }
                  }
                }
                
                // Strategy 4: Fallback to first text node
                if (!targetTextNode) {
                  targetTextNode = instanceTextNodes[0];
                  console.log("Using first text node as fallback");
                }
              }
            }
            
            // Update the text node
            if (targetTextNode) {
              try {
                const currentText = targetTextNode.characters;
                console.log(`Current text in node: "${currentText}"`);
                
                await figma.loadFontAsync(targetTextNode.fontName as FontName);
                targetTextNode.characters = propValue;
                
                // Verify it was set
                const newText = targetTextNode.characters;
                console.log(`✅ Updated text node for "${propName}" from "${currentText}" to "${newText}"`);
                
                if (newText !== propValue) {
                  console.warn(`⚠️ Text mismatch! Expected "${propValue}" but got "${newText}"`);
                  figma.notify(`⚠️ Text update may have failed for "${propName}"`, { timeout: 3000 });
                }
              } catch (error) {
                console.error(`Error updating text node for "${propName}":`, error);
                figma.notify(`❌ Error updating "${propName}": ${(error as Error).message}`, { error: true });
              }
            } else {
              console.error(`❌ Could not find text node for property: ${propName}`);
              figma.notify(`❌ Could not find text node for "${propName}"`, { error: true });
            }
          }
        }
      }

      // Handle image URL if present
      if (imageUrl) {
        console.log(`Processing image URL: ${imageUrl}`);
        figma.notify("🖼️ Fetching image...", { timeout: 2000 });
        
        try {
          // Fetch the image
          const response = await fetch(imageUrl);
          if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
          }
          
          const arrayBuffer = await response.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          
          // Create image in Figma
          const image = figma.createImage(uint8Array);
          const imageHash = image.hash;
          
          console.log(`Image loaded successfully. Hash: ${imageHash}`);
          
          // Find the image layer in the instance
          // Looking for the "img" frame or other common image layer names
          const imageLayer = instance.findOne(node => {
            // Check for frames, ellipses, or rectangles that could hold an image
            if (node.type !== "FRAME" && node.type !== "ELLIPSE" && node.type !== "RECTANGLE") return false;
            
            const name = node.name.toLowerCase();
            return (
              name === "img" ||
              name.includes("image") ||
              name.includes("picture") ||
              name.includes("avatar") ||
              name.includes("photo") ||
              name === "mask" ||
              name.includes("fill")
            );
          }) as FrameNode | EllipseNode | RectangleNode | null;
          
          if (!imageLayer) {
            console.warn("Could not find image layer. Available layers:", 
              instance.findAll(() => true).map(n => `${n.name} (${n.type})`).join(", ")
            );
            figma.notify("⚠️ Could not find image layer in avatar component", { timeout: 4000 });
          } else {
            console.log(`Found image layer: ${imageLayer.name} (${imageLayer.type})`);
            
            // Apply the image as a fill
            const newFills: Paint[] = [{
              type: "IMAGE",
              imageHash: imageHash,
              scaleMode: "FILL", // Options: "FILL", "FIT", "CROP", "TILE"
            }];
            
            imageLayer.fills = newFills;
            console.log(`✅ Applied image to layer: ${imageLayer.name}`);
            figma.notify("✅ Image applied successfully!", { timeout: 2000 });
          }
          
        } catch (error) {
          console.error("Error fetching/applying image:", error);
          figma.notify(`❌ Failed to load image: ${(error as Error).message}`, { 
            error: true, 
            timeout: 5000 
          });
        }
      }

      const allSetProps = [...Object.keys(propertiesToSet), ...Object.keys(textPropertiesToSet)];
      if (imageUrl) allSetProps.push("imageUrl");
      
      if (allSetProps.length > 0) {
        figma.notify(
          `✅ ${componentSet.name} created with props: ${allSetProps.join(", ")}`
        );
      } else {
        figma.notify(
          `✅ ${componentSet.name} created\n\nAvailable properties: ${availableProps.join(", ") || "none"}`,
          { timeout: 5000 }
        );
      }

      // Select and zoom to the newly created instance
      figma.currentPage.selection = [instance];
      figma.viewport.scrollAndZoomIntoView([instance]);

      // Emit completion event so UI can close
      emit("AVATAR_CREATED");

    } catch (error) {
      figma.notify(`❌ Error: ${(error as Error).message}`, { error: true });
      console.error("Plugin error:", error);
    }
  });

  once<CloseHandler>("CLOSE", function () {
    figma.closePlugin();
  });

  showUI({
    height: 560,
    width: 400,
  });
}
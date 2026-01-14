import { once, showUI, emit } from "@create-figma-plugin/utilities";

import { CloseHandler, CreateAvatarHandler } from "./types";

export default function () {
  once<CreateAvatarHandler>("CREATE_AVATAR", async function (data) {
    console.log("=== CREATE_AVATAR event received ===");
    console.log("Data:", data);
    
    try {
      const { props, componentName, code } = data;
      console.log(`Looking for component: "${componentName}"`);

      // Determine which page to search in
      // First, try to find a page with the same name as the component (capitalized)
      const searchName = componentName.charAt(0).toUpperCase() + componentName.slice(1);
      let searchPage: PageNode | null = null;
      
      // Try to find a page named "Button", "Avatar", etc.
      const componentPage = figma.root.children.find(
        (page) => {
          const pageName = page.name;
          const pageNameClean = pageName.replace(/^[^\w\s]+\s*/, '').trim();
          return pageName === searchName || 
                 pageName.toLowerCase() === componentName.toLowerCase() ||
                 pageNameClean === searchName ||
                 pageNameClean.toLowerCase() === componentName.toLowerCase();
        }
      ) as PageNode;
      
      if (componentPage) {
        searchPage = componentPage;
        console.log(`✅ Found page with component name: "${searchPage.name}"`);
      } else {
        searchPage = figma.currentPage;
        console.log(`Page "${searchName}" not found, using current page: "${searchPage.name}"`);
      }

      // Find the Component Set (not individual components)
      console.log(`Searching for component "${searchName}" in page: ${searchPage.name}`);
      
      let componentSet: ComponentSetNode | null = null;
      
      try {
        console.log(`Starting component search in ${searchPage.name}...`);
        
        // Search in the specified page only
        componentSet = searchPage.findOne(
          (node) => {
            if (node.type !== "COMPONENT_SET") return false;
            
            // Match by exact name, lowercase, or by removing emoji/special chars
            const nodeName = node.name;
            const nodeNameClean = nodeName.replace(/^[^\w\s]+\s*/, '').trim(); // Remove leading emoji/special chars
            
            const isMatch = nodeName === searchName || 
                   nodeName.toLowerCase() === componentName.toLowerCase() ||
                   nodeNameClean === searchName ||
                   nodeNameClean.toLowerCase() === componentName.toLowerCase();
            
            if (isMatch) {
              console.log(`✅ Found matching component set: "${nodeName}"`);
            }
            
            return isMatch;
          }
        ) as ComponentSetNode;
        
        console.log("Component set search complete");
      } catch (error) {
        console.error("Error during component search:", error);
        figma.notify(`❌ Error searching for component: ${(error as Error).message}`, { error: true });
        emit("AVATAR_CREATED");
        return;
      }
      
      console.log("Component set found:", componentSet ? componentSet.name : "NOT FOUND");

      if (!componentSet) {
        console.error(`Component Set "${searchName}" not found in page "${searchPage.name}"!`);
        console.log("Trying to find a regular COMPONENT instead...");
        
        // Try to find a regular component (not a component set)
        let regularComponent: ComponentNode | null = null;
        
        try {
          // Search in the specified page
          regularComponent = searchPage.findOne(
            (node) => {
              if (node.type !== "COMPONENT") return false;
              
              const nodeName = node.name;
              const nodeNameClean = nodeName.replace(/^[^\w\s]+\s*/, '').trim();
              
              const isMatch = nodeName === searchName || 
                     nodeName.toLowerCase() === componentName.toLowerCase() ||
                     nodeNameClean === searchName ||
                     nodeNameClean.toLowerCase() === componentName.toLowerCase();
              
              if (isMatch) {
                console.log(`✅ Found matching regular component: "${nodeName}"`);
              }
              
              return isMatch;
            }
          ) as ComponentNode;
        } catch (error) {
          console.error("Error searching for regular component:", error);
        }
        
        if (regularComponent) {
          console.log(`✅ Found regular component: ${regularComponent.name}`);
          figma.notify(`Found Component: ${regularComponent.name} (note: not a Component Set)`);
          
          // Create an instance of the regular component
          const instance = regularComponent.createInstance();
          console.log("✅ Instance created successfully");
          
          // Position the instance in the center of the viewport
          const viewportCenter = figma.viewport.center;
          instance.x = viewportCenter.x;
          instance.y = viewportCenter.y;
          
          // Select and zoom to the newly created instance
          figma.currentPage.selection = [instance];
          figma.viewport.scrollAndZoomIntoView([instance]);
          
          figma.notify(`✅ ${regularComponent.name} created (no properties set - not a Component Set)`);
          emit("AVATAR_CREATED");
          return;
        }
        
        // Debug: show what's available
        console.log("Getting all component sets and components...");
        const allComponentSets = searchPage.findAll(
          (node) => node.type === "COMPONENT_SET"
        ) as ComponentSetNode[];
        
        const allComponents = searchPage.findAll(
          (node) => node.type === "COMPONENT"
        ) as ComponentNode[];
        
        console.log("Available component sets:", allComponentSets.map(c => c.name));
        console.log("Available regular components:", allComponents.map(c => c.name));
        
        const componentSetList = allComponentSets.length > 0
          ? allComponentSets.map(c => `• ${c.name} (Component Set)`).join("\n")
          : "";
          
        const componentList = allComponents.length > 0
          ? allComponents.map(c => `• ${c.name} (Component)`).join("\n")
          : "";
        
        const message = `❌ Component "${searchName}" not found in page "${searchPage.name}".\n\nAvailable:\n${componentSetList}${componentSetList && componentList ? "\n" : ""}${componentList}`;
        
        figma.notify(
          message || `❌ Component "${searchName}" not found. No components in "${searchPage.name}".`, 
          { error: true, timeout: 10000 }
        );
        
        // Emit completion so UI doesn't stay stuck
        emit("AVATAR_CREATED");
        return;
      }

      console.log(`✅ Found Component Set: ${componentSet.name}`);
      figma.notify(`Found Component Set: ${componentSet.name}`);

      // Get the default variant (first child component)
      const defaultVariant = componentSet.defaultVariant || componentSet.children[0] as ComponentNode;
      console.log("Default variant:", defaultVariant ? defaultVariant.name : "NOT FOUND");

      if (!defaultVariant || defaultVariant.type !== "COMPONENT") {
        console.error("No valid variant found!");
        figma.notify("❌ Could not find a variant in the component set", { error: true });
        emit("AVATAR_CREATED");
        return;
      }

      console.log("Creating instance...");
      // Create an instance of the default variant
      const instance = defaultVariant.createInstance();
      console.log("✅ Instance created successfully");

      // Position the instance in the center of the viewport
      const viewportCenter = figma.viewport.center;
      instance.x = viewportCenter.x;
      instance.y = viewportCenter.y;

      // Get available properties from the component
      const availableProps = Object.keys(instance.componentProperties || {});
      console.log("Available component properties:", availableProps);

      // Map common prop names to Figma component properties
      // Updated to include new Button component properties
      const propertyMapping: Record<string, string> = {
        // Avatar properties
        size: "size",
        type: "type",
        shape: "shape",
        outline: "outline",
        lowerBadge: "lower badge",
        upperBadge: "upper badge",
        initials: "initials",
        
        // Button properties (new design system)
        variant: "variant",      // filled, outlined, text
        intent: "intent",        // primary, secondary, etc.
        state: "state",          // default, hover, pressed, etc.
        loading: "loading",      // boolean
        disabled: "disabled",    // boolean
        "With left icon": "With left icon",   // boolean
        "With right icon": "With right icon", // boolean
        
        // Card properties
        padding: "padding",
        borderRadius: "borderRadius",
        borderColor: "borderColor",
        Elevation: "Elevation",
        
        // Legacy mappings for backward compatibility
        "✏️ label": "label",
        "icon L": "icon L",
        "icon R": "icon R",
      };

      // Separate TEXT properties from other properties
      // TEXT properties need special handling - we update the text node directly
      const propertiesToSet: Record<string, any> = {};
      const textPropertiesToSet: Record<string, string> = {};
      let imageUrl: string | null = null;
      
      for (const [propKey, propValue] of Object.entries(props)) {
        console.log(`Processing prop: ${propKey} = ${propValue}`);
        
        // Special handling for button text (children)
        if (propKey === "children" && componentName === "button") {
          // For buttons, text goes directly to a text node, not as a property
          textPropertiesToSet["buttonText"] = String(propValue);
          console.log(`Set button text: ${propValue}`);
          continue;
        }
        
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
              console.log(`Set property: "${actualPropertyName}" = ${propValue}`);
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
          console.log("Setting properties:", propertiesToSet);
          instance.setProperties(propertiesToSet);
          console.log("✅ Set non-text properties successfully");
        } catch (error) {
          console.error("❌ Property setting error:", error);
          figma.notify(`⚠️ Some properties could not be set: ${(error as Error).message}`, { 
            timeout: 5000 
          });
        }
      }

      // Special handling for Card components with nested content
      if (componentName === "card" && code) {
        console.log("Processing Card component with nested children...");
        
        // Find nested Button components
        const nestedButtons = instance.findAll(node => {
          if (node.type !== "INSTANCE") return false;
          const mainComp = (node as InstanceNode).mainComponent;
          if (!mainComp) return false;
          const compName = mainComp.name.replace(/^[^\w\s]+\s*/, '').trim();
          return compName.toLowerCase() === "button";
        }) as InstanceNode[];
        
        console.log(`Found ${nestedButtons.length} nested button(s)`);
        
        // Parse the original code to extract button texts and props
        // This is a simplified parser - you might need to enhance it
        const buttonRegex = /<Button[^>]*>([\s\S]*?)<\/Button>/gi;
        const buttonMatches = [...code.matchAll(buttonRegex)];
        
        console.log(`Found ${buttonMatches.length} button(s) in code`);
        
        // Update each nested button
        buttonMatches.forEach((match, index) => {
          if (index >= nestedButtons.length) return;
          
          const buttonInstance = nestedButtons[index];
          const buttonContent = match[1].trim();
          const buttonProps = match[0];
          
          console.log(`Processing button ${index}: "${buttonContent}"`);
          
          // Extract props from the button tag
          const variantMatch = /variant=["']([^"']+)["']/.exec(buttonProps);
          const intentMatch = /intent=["']([^"']+)["']/.exec(buttonProps);
          
          try {
            // Set button properties if available
            const buttonPropsToSet: Record<string, any> = {};
            if (variantMatch) buttonPropsToSet.variant = variantMatch[1];
            if (intentMatch) buttonPropsToSet.intent = intentMatch[1];
            
            if (Object.keys(buttonPropsToSet).length > 0) {
              buttonInstance.setProperties(buttonPropsToSet);
              console.log(`Set properties for button ${index}:`, buttonPropsToSet);
            }
            
            // Update button text
            const buttonTextNodes = buttonInstance.findAll(node => node.type === "TEXT") as TextNode[];
            if (buttonTextNodes.length > 0 && buttonContent) {
              const textNode = buttonTextNodes[0];
              figma.loadFontAsync(textNode.fontName as FontName).then(() => {
                textNode.characters = buttonContent;
                console.log(`✅ Updated button ${index} text to: "${buttonContent}"`);
              });
            }
          } catch (error) {
            console.error(`Error updating button ${index}:`, error);
          }
        });
        
        // Find and update Heading text
        const headingRegex = /<Heading[^>]*>([\s\S]*?)<\/Heading>/i;
        const headingMatch = headingRegex.exec(code);
        if (headingMatch) {
          const headingText = headingMatch[1].trim();
          console.log(`Found heading text: "${headingText}"`);
          
          // Find text nodes that might be the heading
          const allTextNodes = instance.findAll(node => node.type === "TEXT") as TextNode[];
          // Heading is typically the first large text node or one with "title" in its name
          const headingNode = allTextNodes.find(node => 
            node.name.toLowerCase().includes("title") || 
            node.name.toLowerCase().includes("heading") ||
            node.characters.includes("Card title")
          );
          
          if (headingNode && headingText) {
            try {
              await figma.loadFontAsync(headingNode.fontName as FontName);
              headingNode.characters = headingText;
              console.log(`✅ Updated heading to: "${headingText}"`);
            } catch (error) {
              console.error("Error updating heading:", error);
            }
          }
        }
        
        // Find and update Text/paragraph content
        const textRegex = /<Text[^>]*>([\s\S]*?)<\/Text>/gi;
        const textMatches = [...code.matchAll(textRegex)];
        
        if (textMatches.length > 0) {
          console.log(`Found ${textMatches.length} text element(s)`);
          
          const allTextNodes = instance.findAll(node => node.type === "TEXT") as TextNode[];
          // Filter out button text and heading
          const contentTextNodes = allTextNodes.filter(node => {
            const inButton = nestedButtons.some(btn => btn.findOne(n => n === node));
            const isHeading = node.name.toLowerCase().includes("title") || 
                            node.name.toLowerCase().includes("heading");
            return !inButton && !isHeading;
          });
          
          // Update content text nodes
          textMatches.forEach((match, index) => {
            if (index >= contentTextNodes.length) return;
            const textContent = match[1].trim();
            const textNode = contentTextNodes[index];
            
            try {
              figma.loadFontAsync(textNode.fontName as FontName).then(() => {
                textNode.characters = textContent;
                console.log(`✅ Updated content text ${index} to: "${textContent}"`);
              });
            } catch (error) {
              console.error(`Error updating text ${index}:`, error);
            }
          });
        }
      }

      // Handle TEXT properties and button text by updating text nodes directly
      if (Object.keys(textPropertiesToSet).length > 0) {
        const instanceTextNodes = instance.findAll(node => node.type === "TEXT") as TextNode[];
        
        console.log(`Found ${instanceTextNodes.length} text node(s) in instance`);
        console.log("Text properties to set:", textPropertiesToSet);
        
        if (instanceTextNodes.length === 0) {
          console.error("No text nodes found in instance");
          figma.notify("⚠️ No text nodes found in component", { timeout: 3000 });
        } else {
          // For button text (from children prop)
          if (textPropertiesToSet["buttonText"]) {
            const buttonText = textPropertiesToSet["buttonText"];
            console.log(`Setting button text to: "${buttonText}"`);
            
            // For buttons, find the main text layer
            let targetTextNode: TextNode | null = null;
            
            // Try to find text node by common button text layer names
            for (const textNode of instanceTextNodes) {
              const nodeName = textNode.name.toLowerCase();
              if (nodeName.includes("label") || 
                  nodeName.includes("text") || 
                  nodeName.includes("button") ||
                  textNode.characters.includes("Button") || // Default Figma button text
                  textNode.characters.includes("Test")) {   // Your example shows "Test"
                targetTextNode = textNode;
                console.log(`Found button text node: ${textNode.name}`);
                break;
              }
            }
            
            // If not found by name, use the first/largest text node
            if (!targetTextNode && instanceTextNodes.length > 0) {
              targetTextNode = instanceTextNodes[0];
              console.log("Using first text node as fallback for button text");
            }
            
            if (targetTextNode) {
              try {
                await figma.loadFontAsync(targetTextNode.fontName as FontName);
                targetTextNode.characters = buttonText;
                console.log(`✅ Updated button text to: "${buttonText}"`);
              } catch (error) {
                console.error("Error updating button text:", error);
                figma.notify(`❌ Error updating button text: ${(error as Error).message}`, { 
                  error: true 
                });
              }
            }
            
            // Remove buttonText from the list so it doesn't get processed again
            delete textPropertiesToSet["buttonText"];
          }
          
          // Handle other TEXT properties (for avatars, etc.)
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
              
              // Strategy 3: Fallback to first text node
              if (!targetTextNode) {
                targetTextNode = instanceTextNodes[0];
                console.log("Using first text node as fallback");
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
                }
              } catch (error) {
                console.error(`Error updating text node for "${propName}":`, error);
                figma.notify(`❌ Error updating "${propName}": ${(error as Error).message}`, { 
                  error: true 
                });
              }
            } else {
              console.error(`❌ Could not find text node for property: ${propName}`);
            }
          }
        }
      }

      // Handle image URL if present (for avatars)
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
              scaleMode: "FILL",
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
          `✅ ${componentSet.name} created`,
          { timeout: 3000 }
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
      
      // Make sure to emit completion even on error so UI doesn't stay stuck
      emit("AVATAR_CREATED");
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
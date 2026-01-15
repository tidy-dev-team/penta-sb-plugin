import { once, showUI, emit } from "@create-figma-plugin/utilities";

import { CloseHandler, CreateAvatarHandler } from "./types";

export default function () {
  once<CreateAvatarHandler>("CREATE_AVATAR", async function (data) {
    console.log("=== CREATE_AVATAR event received ===");
    console.log("Data:", data);
    
    try {
      const { props, componentName } = data;
      const code = (data as any).code as string | undefined; // Type assertion to access code
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
      
      // Log the actual property definitions to see valid values
      console.log("Property definitions:");
      Object.entries(instance.componentProperties || {}).forEach(([key, prop]) => {
        if (prop.type === "VARIANT") {
          console.log(`  ${key}: type=${prop.type}, value=${prop.value}, variantOptions=${(prop as any).variantOptions}`);
        } else {
          console.log(`  ${key}: type=${prop.type}, value=${prop.value}`);
        }
      });

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

      // Map prop values from code to Figma's expected values
      const valueMapping: Record<string, Record<string, string>> = {
        padding: {
          "0": "0 (0px)",
          "1": "1 (4px)",
          "2": "2 (8px)",
          "3": "3 (12px)",
          "4": "4 (16px)",
          "5": "5 (20px)",
          "6": "6 (24px)",
          "7": "7 (28px)",
          "8": "8 (32px)",
        },
        borderRadius: {
          "none": "None",
          "sm": "sm (4px)",
          "md": "md (8px)",
          "lg": "lg (12px)",
          "xl": "xl (12px)",
          "2xl": "2xl (16px)",
          "3xl": "3xl (24px)",
          "full": "Full",
        },
        borderColor: {
          "standard": "standard",
          "border": "standard",
          "error": "error",
          "success": "success",
        },
        Elevation: {
          "none": "None",
          "on-top-of-bg": "On top of BG",
          "On top of BG": "On top of BG",
        },
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
              // Apply value mapping if it exists for this property
              let mappedValue = propValue;
              if (valueMapping[figmaPropertyName] && typeof propValue === "string") {
                const mappedVal = valueMapping[figmaPropertyName][propValue];
                if (mappedVal) {
                  mappedValue = mappedVal;
                  console.log(`Mapped value "${propValue}" to "${mappedValue}" for property "${figmaPropertyName}"`);
                } else {
                  console.warn(`No mapping found for value "${propValue}" in property "${figmaPropertyName}"`);
                }
              }
              propertiesToSet[actualPropertyName] = mappedValue;
              console.log(`Set property: "${actualPropertyName}" = ${mappedValue}`);
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
          console.log("=== Setting properties ===");
          console.log("Properties to set:", propertiesToSet);
          instance.setProperties(propertiesToSet);
          console.log("✅ Set non-text properties successfully");
        } catch (error) {
          console.error("❌ Property setting error:", error);
          figma.notify(`⚠️ Some properties could not be set: ${(error as Error).message}`, { 
            timeout: 5000 
          });
        }
      } else {
        console.log("No non-text properties to set");
      }

      // Helper function to clean text from React artifacts
      const cleanText = (text: string) => {
        return text
          .replace(/\{\s*['"]\s*['"]\s*\}/g, '') // Remove {" "} or {' '}
          .replace(/\s+/g, ' ') // Normalize whitespace
          .trim();
      };

      // Special handling for Card components with nested content
      if (componentName === "card" && code) {
        console.log("Processing Card component with nested children...");
        console.log("=== STAGE 1: Creating Content Component ===");
        
        // Extract Card props directly from the code with improved regex
        const cardPropsFromCode: Record<string, string> = {};
        const cardTagMatch = /<Card\s+([\s\S]*?)>/i.exec(code);
        if (cardTagMatch) {
          const cardPropsString = cardTagMatch[1];
          console.log("Card props string:", cardPropsString);
          
          // Extract padding (with or without quotes)
          const paddingMatch = /padding\s*=\s*["']?([^"'\s>]+)["']?/i.exec(cardPropsString);
          if (paddingMatch) {
            cardPropsFromCode.padding = paddingMatch[1];
            console.log("Extracted padding from code:", paddingMatch[1]);
          }
          
          // Extract borderRadius (with or without quotes)
          const borderRadiusMatch = /borderRadius\s*=\s*["']?([^"'\s>]+)["']?/i.exec(cardPropsString);
          if (borderRadiusMatch) {
            cardPropsFromCode.borderRadius = borderRadiusMatch[1];
            console.log("Extracted borderRadius from code:", borderRadiusMatch[1]);
          }
          
          // Extract borderColor (with or without quotes)
          const borderColorMatch = /borderColor\s*=\s*["']?([^"'\s>]+)["']?/i.exec(cardPropsString);
          if (borderColorMatch) {
            cardPropsFromCode.borderColor = borderColorMatch[1];
            console.log("Extracted borderColor from code:", borderColorMatch[1]);
          }
        }
        
        // Create the content component first
        const contentFrame = figma.createFrame();
        contentFrame.name = "Card Content";
        contentFrame.layoutMode = "VERTICAL";
        contentFrame.primaryAxisSizingMode = "AUTO";
        contentFrame.counterAxisSizingMode = "AUTO";
        contentFrame.itemSpacing = 16; // gap="4" in your design system (4 * 4px = 16px)
        contentFrame.fills = []; // Transparent
        
        console.log("Created content frame");
        
        // Position it near the card instance for visibility
        contentFrame.x = instance.x + instance.width + 100;
        contentFrame.y = instance.y;
        
        // Parse and create Heading
        const headingRegex = /<Heading[^>]*>([\s\S]*?)<\/Heading>/i;
        const headingMatch = headingRegex.exec(code);
        if (headingMatch) {
          const headingText = cleanText(headingMatch[1]);
          console.log(`Creating heading: "${headingText}"`);
          
          const textNode = figma.createText();
          textNode.name = "Heading";
          
          // Load a bold font
          await figma.loadFontAsync({ family: "Inter", style: "Bold" });
          textNode.fontName = { family: "Inter", style: "Bold" };
          textNode.fontSize = 24;
          textNode.characters = headingText;
          
          // Set text to fill width of parent container
          textNode.textAutoResize = "HEIGHT";
          textNode.resize(400, textNode.height); // Give it a reasonable width
          
          contentFrame.appendChild(textNode);
          console.log("✅ Added heading to content frame");
        }
        
        // Parse and create Text content
        const textRegex = /<Text[^>]*>([\s\S]*?)<\/Text>/gi;
        const textMatches = [...code.matchAll(textRegex)];
        
        if (textMatches.length > 0) {
          console.log(`Creating ${textMatches.length} text element(s)`);
          
          // Create a container for text elements
          const textContainer = figma.createFrame();
          textContainer.name = "Text Container";
          textContainer.layoutMode = "VERTICAL";
          textContainer.primaryAxisSizingMode = "AUTO";
          textContainer.counterAxisSizingMode = "AUTO";
          textContainer.itemSpacing = 8; // gap="2" (2 * 4px = 8px)
          textContainer.fills = [];
          
          for (const match of textMatches) {
            const textContent = cleanText(match[1]);
            if (textContent) {
              const textNode = figma.createText();
              textNode.name = "Text";
              
              await figma.loadFontAsync({ family: "Inter", style: "Regular" });
              textNode.fontName = { family: "Inter", style: "Regular" };
              textNode.fontSize = 14;
              textNode.characters = textContent;
              
              // Set text to wrap and fill width
              textNode.textAutoResize = "HEIGHT";
              textNode.resize(400, textNode.height);
              
              textContainer.appendChild(textNode);
            }
          }
          
          contentFrame.appendChild(textContainer);
          console.log("✅ Added text elements to content frame");
        }
        
        // Parse and create Buttons
        const buttonRegex = /<Button[^>]*>([\s\S]*?)<\/Button>/gi;
        const buttonMatches = [...code.matchAll(buttonRegex)];
        
        if (buttonMatches.length > 0) {
          console.log(`Creating ${buttonMatches.length} button(s)`);
          
          // Create a container for buttons
          const buttonContainer = figma.createFrame();
          buttonContainer.name = "Button Container";
          buttonContainer.layoutMode = "HORIZONTAL";
          buttonContainer.primaryAxisSizingMode = "AUTO";
          buttonContainer.counterAxisSizingMode = "AUTO";
          buttonContainer.itemSpacing = 12; // gap="3" (3 * 4px = 12px)
          buttonContainer.fills = [];
          
          // Find the Button component
          const buttonPage = figma.root.children.find(
            (page) => {
              const pageName = page.name.toLowerCase();
              return pageName === "button" || pageName.includes("button");
            }
          ) as PageNode;
          
          let buttonComponent: ComponentSetNode | null = null;
          
          if (buttonPage) {
            buttonComponent = buttonPage.findOne(
              (node) => node.type === "COMPONENT_SET" && node.name.toLowerCase().includes("button")
            ) as ComponentSetNode;
          }
          
          if (!buttonComponent) {
            // Try current page
            buttonComponent = figma.currentPage.findOne(
              (node) => node.type === "COMPONENT_SET" && node.name.toLowerCase().includes("button")
            ) as ComponentSetNode;
          }
          
          if (buttonComponent) {
            console.log("Found Button component:", buttonComponent.name);
            
            for (const match of buttonMatches) {
              const buttonContent = cleanText(match[1]);
              const buttonTag = match[0];
              
              console.log(`Parsing button tag: ${buttonTag}`);
              
              // Extract button props from the tag
              const variantMatch = /variant\s*=\s*["']([^"']+)["']/i.exec(buttonTag);
              const intentMatch = /intent\s*=\s*["']([^"']+)["']/i.exec(buttonTag);
              const sizeMatch = /size\s*=\s*["']([^"']+)["']/i.exec(buttonTag);
              
              // Create button instance
              const defaultVariant = buttonComponent.defaultVariant || buttonComponent.children[0] as ComponentNode;
              const buttonInstance = defaultVariant.createInstance();
              
              // Build the properties object based on what's in the React code
              const buttonPropsToSet: Record<string, any> = {};
              
              // Variant: use from code if present, otherwise default to "filled"
              if (variantMatch) {
                const variant = variantMatch[1];
                buttonPropsToSet.variant = variant === "outline" ? "outlined" : variant;
              } else {
                // If no variant specified in React code, it means default (filled)
                buttonPropsToSet.variant = "filled";
              }
              
              // Intent: use from code if present, otherwise default to "primary"
              if (intentMatch) {
                buttonPropsToSet.intent = intentMatch[1];
              } else {
                buttonPropsToSet.intent = "primary";
              }
              
              // Size: use from code if present, otherwise default to "lg"
              if (sizeMatch) {
                buttonPropsToSet.size = sizeMatch[1];
              } else {
                buttonPropsToSet.size = "lg";
              }
              
              // Always set state to "default" (not typically specified in React)
              buttonPropsToSet.state = "default";
              
              console.log(`Button properties to set:`, buttonPropsToSet);
              
              // Set the properties
              try {
                buttonInstance.setProperties(buttonPropsToSet);
                console.log(`✅ Set button properties successfully`);
              } catch (propError) {
                console.warn(`⚠️ Could not set button properties:`, propError);
                // If the exact combination doesn't exist, try with just intent
                try {
                  buttonInstance.setProperties({
                    intent: buttonPropsToSet.intent,
                    variant: "filled",
                    size: "lg",
                    state: "default"
                  });
                  console.log(`✅ Set button with fallback properties`);
                } catch (fallbackError) {
                  console.error(`❌ Even fallback properties failed:`, fallbackError);
                }
              }
              
              // Update button text
              const buttonTextNodes = buttonInstance.findAll(node => node.type === "TEXT") as TextNode[];
              if (buttonTextNodes.length > 0 && buttonContent) {
                const textNode = buttonTextNodes[0];
                await figma.loadFontAsync(textNode.fontName as FontName);
                textNode.characters = buttonContent;
              }
              
              buttonContainer.appendChild(buttonInstance);
              console.log(`✅ Created button: "${buttonContent}"`);
            }
            
            contentFrame.appendChild(buttonContainer);
          } else {
            console.warn("Button component not found - skipping button creation");
          }
        }
        
        console.log("=== STAGE 2: Setting up Card with Content ===");
        
        // Now handle the Card Settings
        const cardSettings = instance.findOne(node => {
          if (node.type !== "INSTANCE") return false;
          const mainComp = (node as InstanceNode).mainComponent;
          if (!mainComp) return false;
          
          // Check if the main component or parent component set is "Card Settings"
          const compName = mainComp.name.replace(/^[^\w\s]+\s*/, '').trim().toLowerCase();
          const parentCompSet = mainComp.parent;
          const parentName = parentCompSet && parentCompSet.type === "COMPONENT_SET" 
            ? parentCompSet.name.replace(/^[^\w\s]+\s*/, '').trim().toLowerCase()
            : "";
          
          // More flexible matching - look for "settings" in component or parent
          const isCardSettings = compName.includes("settings") || 
                                 compName.includes("card settings") ||
                                 parentName.includes("settings") ||
                                 parentName.includes("card settings") ||
                                 node.name.toLowerCase().includes("settings");
          
          if (isCardSettings) {
            console.log(`Found potential Card Settings: "${node.name}" (component: ${compName}, parent: ${parentName})`);
          }
          
          return isCardSettings;
        }) as InstanceNode;
        
        if (cardSettings) {
          console.log("Found Card Settings instance:", cardSettings.name);
          
          // Log available properties in Card Settings
          const cardSettingsProps: Record<string, any> = {};
          const cardSettingsAvailableProps = Object.keys(cardSettings.componentProperties || {});
          console.log("Card Settings available properties:", cardSettingsAvailableProps);
          console.log("Card Settings property definitions:");
          Object.entries(cardSettings.componentProperties || {}).forEach(([key, prop]) => {
            console.log(`  ${key}: type=${prop.type}, value=${prop.value}`);
          });
          
          // Use cardPropsFromCode instead of props
          if (cardPropsFromCode.padding) {
            const paddingValue = valueMapping.padding?.[cardPropsFromCode.padding];
            if (paddingValue) {
              cardSettingsProps.padding = paddingValue;
              console.log(`Mapping padding "${cardPropsFromCode.padding}" to "${paddingValue}"`);
            } else {
              // Try without mapping
              cardSettingsProps.padding = cardPropsFromCode.padding;
              console.log(`Using raw padding value: "${cardPropsFromCode.padding}"`);
            }
          }
          
          if (cardPropsFromCode.borderRadius) {
            const borderRadiusValue = valueMapping.borderRadius?.[cardPropsFromCode.borderRadius];
            if (borderRadiusValue) {
              cardSettingsProps.borderRadius = borderRadiusValue;
              console.log(`Mapping borderRadius "${cardPropsFromCode.borderRadius}" to "${borderRadiusValue}"`);
            } else {
              // Try without mapping
              cardSettingsProps.borderRadius = cardPropsFromCode.borderRadius;
              console.log(`Using raw borderRadius value: "${cardPropsFromCode.borderRadius}"`);
            }
          }
          
          // Note: borderColor is on the parent Card component, not in Card Settings
          // We already set it earlier on the main Card instance
          
          if (Object.keys(cardSettingsProps).length > 0) {
            try {
              console.log("Attempting to set Card Settings properties:", cardSettingsProps);
              cardSettings.setProperties(cardSettingsProps);
              console.log("✅ Set Card Settings properties:", cardSettingsProps);
              figma.notify(`✅ Card settings applied: ${Object.keys(cardSettingsProps).join(", ")}`, { timeout: 3000 });
            } catch (error) {
              console.error("❌ Error setting Card Settings properties:", error);
              console.error("Error details:", (error as Error).message);
              figma.notify(`⚠️ Could not set some card properties: ${(error as Error).message}`, { 
                timeout: 5000 
              });
            }
          }
        } else {
          console.warn("Card Settings instance not found in Card component");
        }
        
        console.log("=== STAGE 3: Creating and swapping content component ===");
        
        // Automatically create a component from the content frame
        const contentComponent = figma.createComponent();
        contentComponent.name = "Card Content - " + Date.now(); // Unique name
        contentComponent.layoutMode = contentFrame.layoutMode;
        contentComponent.primaryAxisSizingMode = contentFrame.primaryAxisSizingMode;
        contentComponent.counterAxisSizingMode = contentFrame.counterAxisSizingMode;
        contentComponent.itemSpacing = contentFrame.itemSpacing;
        contentComponent.fills = contentFrame.fills;
        
        // Position it near the card
        contentComponent.x = contentFrame.x;
        contentComponent.y = contentFrame.y;
        
        // Copy all children from frame to component
        const childrenToCopy = [...contentFrame.children];
        for (const child of childrenToCopy) {
          contentComponent.appendChild(child);
        }
        
        // Remove the temporary frame
        contentFrame.remove();
        
        console.log("✅ Created component:", contentComponent.name);
        
        // Now try to find the instance swap property and set it
        if (cardSettings) {
          const swapProperty = Object.keys(cardSettings.componentProperties || {}).find(key => 
            key.toLowerCase().includes("replace") || 
            key.toLowerCase().includes("local component")
          );
          
          if (swapProperty) {
            console.log(`Found instance swap property: "${swapProperty}"`);
            
            try {
              // Set the instance swap to our new component
              cardSettings.setProperties({
                [swapProperty]: contentComponent.id
              });
              
              console.log("✅ Successfully swapped in content component!");
              figma.notify("✅ Card created with content inside!", { timeout: 3000 });
              
              // Select just the card
              figma.currentPage.selection = [instance];
              figma.viewport.scrollAndZoomIntoView([instance]);
            } catch (error) {
              console.error("❌ Error swapping component:", error);
              
              // Fallback: show both and ask user to do it manually
              figma.currentPage.selection = [instance, contentComponent];
              figma.viewport.scrollAndZoomIntoView([instance, contentComponent]);
              
              figma.notify(
                "✅ Card & Content created!\n\nManual step needed:\n1. Select the Card\n2. Use '🔁 Replace with Local component' to select 'Card Content'",
                { timeout: 10000 }
              );
            }
          } else {
            console.warn("Could not find instance swap property");
            
            // Show both
            figma.currentPage.selection = [instance, contentComponent];
            figma.viewport.scrollAndZoomIntoView([instance, contentComponent]);
            
            figma.notify(
              "✅ Card & Content created!\n\nManual step:\n1. Select Card\n2. Use '🔁 Replace with Local component' dropdown",
              { timeout: 10000 }
            );
          }
        } else {
          console.warn("No Card Settings found for swapping");
          
          figma.currentPage.selection = [instance, contentComponent];
          figma.viewport.scrollAndZoomIntoView([instance, contentComponent]);
          
          figma.notify("✅ Card & Content created - manual swap needed", { timeout: 5000 });
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
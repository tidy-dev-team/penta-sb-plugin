import { once, showUI, emit } from "@create-figma-plugin/utilities";

import { CloseHandler, CreateAvatarHandler } from "./types";

export default function () {
  once<CreateAvatarHandler>("CREATE_AVATAR", async function (data) {
    console.log("=== CREATE_AVATAR event received ===");
    console.log("Data:", data);
    
    try {
      let { props, componentName } = data;
      const code = (data as any).code as string | undefined;
      
      // If we have code, try to extract the first component after return
      if (code && componentName) {
        const returnMatch = /return\s*\(\s*<(\w+)/i.exec(code);
        if (returnMatch && returnMatch[1]) {
          const extractedComponentName = returnMatch[1].toLowerCase();
          console.log(`Extracted component from return statement: ${extractedComponentName}`);
          componentName = extractedComponentName;
        }
      }
      
      console.log(`Looking for component: "${componentName}"`);

      const searchName = componentName.charAt(0).toUpperCase() + componentName.slice(1);
      let searchPage: PageNode | null = null;
      
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

      console.log(`Searching for component "${searchName}" in page: ${searchPage.name}`);
      
      let componentSet: ComponentSetNode | null = null;
      
      try {
        console.log(`Starting component search in ${searchPage.name}...`);
        
        componentSet = searchPage.findOne(
          (node) => {
            if (node.type !== "COMPONENT_SET") return false;
            
            const nodeName = node.name;
            const nodeNameClean = nodeName.replace(/^[^\w\s]+\s*/, '').trim();
            
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
        
        let regularComponent: ComponentNode | null = null;
        
        try {
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
          
          const instance = regularComponent.createInstance();
          console.log("✅ Instance created successfully");
          
          const viewportCenter = figma.viewport.center;
          instance.x = viewportCenter.x;
          instance.y = viewportCenter.y;
          
          figma.currentPage.selection = [instance];
          figma.viewport.scrollAndZoomIntoView([instance]);
          
          figma.notify(`✅ ${regularComponent.name} created (no properties set - not a Component Set)`);
          emit("AVATAR_CREATED");
          return;
        }
        
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
        
        emit("AVATAR_CREATED");
        return;
      }

      console.log(`✅ Found Component Set: ${componentSet.name}`);
      figma.notify(`Found Component Set: ${componentSet.name}`);

      const defaultVariant = componentSet.defaultVariant || componentSet.children[0] as ComponentNode;
      console.log("Default variant:", defaultVariant ? defaultVariant.name : "NOT FOUND");

      if (!defaultVariant || defaultVariant.type !== "COMPONENT") {
        console.error("No valid variant found!");
        figma.notify("❌ Could not find a variant in the component set", { error: true });
        emit("AVATAR_CREATED");
        return;
      }

      console.log("Creating instance...");
      const instance = defaultVariant.createInstance();
      console.log("✅ Instance created successfully");

      const viewportCenter = figma.viewport.center;
      instance.x = viewportCenter.x;
      instance.y = viewportCenter.y;

      const availableProps = Object.keys(instance.componentProperties || {});
      console.log("Available component properties:", availableProps);
      
      console.log("Property definitions:");
      Object.entries(instance.componentProperties || {}).forEach(([key, prop]) => {
        if (prop.type === "VARIANT") {
          console.log(`  ${key}: type=${prop.type}, value=${prop.value}, variantOptions=${(prop as any).variantOptions}`);
        } else {
          console.log(`  ${key}: type=${prop.type}, value=${prop.value}`);
        }
      });

      const propertyMapping: Record<string, string> = {
        size: "size",
        type: "type",
        shape: "shape",
        outline: "outline",
        lowerBadge: "lower badge",
        upperBadge: "upper badge",
        initials: "initials",
        variant: "variant",
        intent: "intent",
        state: "state",
        loading: "loading",
        disabled: "disabled",
        "With left icon": "With left icon",
        "With right icon": "With right icon",
        padding: "padding",
        borderRadius: "borderRadius",
        borderColor: "borderColor",
        Elevation: "Elevation",
        "✏️ label": "label",
        "icon L": "icon L",
        "icon R": "icon R",
      };

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

      // Mapping from React color prop values to Figma variable names
      const colorVariableMapping: Record<string, string> = {
        "bodyPrimary": "Color/foreground/primary",
        "bodySecondary": "Color/foreground/secondary",
        "heading": "Color/foreground/primary",
        "primary": "Color/foreground/primary",
        "secondary": "Color/foreground/secondary",
      };

      const propertiesToSet: Record<string, any> = {};
      const textPropertiesToSet: Record<string, string> = {};
      let imageUrl: string | null = null;
      
      for (const [propKey, propValue] of Object.entries(props)) {
        console.log(`Processing prop: ${propKey} = ${propValue}`);
        
        if (propKey === "children" && componentName === "button") {
          textPropertiesToSet["buttonText"] = String(propValue);
          console.log(`Set button text: ${propValue}`);
          continue;
        }
        
        if (propKey === "imageUrl") {
          imageUrl = String(propValue);
          console.log(`Found imageUrl: ${imageUrl}`);
          continue;
        }

        const figmaPropertyName = propertyMapping[propKey];
        
        if (figmaPropertyName) {
          let actualPropertyName: string | null = null;
          
          if (availableProps.includes(figmaPropertyName)) {
            actualPropertyName = figmaPropertyName;
          } else {
            for (const availableProp of availableProps) {
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

      const cleanText = (text: string) => {
        return text
          .replace(/\{\s*['"]\s*['"]\s*\}/g, '')
          .replace(/\{['"]\s*/g, '')
          .replace(/\s*['"]\}/g, '')
          .replace(/\}\s*\{/g, '')
          .replace(/^\s*\}+\s*/g, '')
          .replace(/\s*\{+\s*$/g, '')
          .replace(/\}\s*$/g, '')
          .replace(/^\s*\{/g, '')
          .replace(/\s+/g, ' ')
          .trim();
      };

      const applyColorVariable = async (textNode: TextNode, colorProp: string = "bodyPrimary") => {
        // Map the React color prop to the Figma variable name
        const variableName = colorVariableMapping[colorProp] || "Color/foreground/primary";
        
        const colorVariable = figma.variables.getLocalVariables().find(variable =>
          variable.name === variableName
        );
        
        if (colorVariable) {
          console.log(`Found color variable: ${colorVariable.name} (from color prop: ${colorProp})`);
          try {
            const fills = textNode.fills as SolidPaint[];
            if (fills && fills.length > 0 && fills[0].type === "SOLID") {
              const newFill: SolidPaint = {
                ...fills[0],
                boundVariables: {
                  color: {
                    type: "VARIABLE_ALIAS",
                    id: colorVariable.id
                  }
                }
              };
              textNode.fills = [newFill];
              console.log(`✅ Applied color variable to text node`);
            }
          } catch (error) {
            console.warn("Could not bind color variable:", error);
          }
        } else {
          console.warn(`Could not find color variable: ${variableName}`);
          console.log("Available variables:", figma.variables.getLocalVariables().map(v => v.name).join(", "));
        }
      };

      if (componentName === "card" && code) {
        console.log("Processing Card component with nested children...");
        console.log("=== STAGE 1: Creating Content Component ===");
        
        const cardPropsFromCode: Record<string, string> = {};
        const cardTagMatch = /<Card\s+([\s\S]*?)>/i.exec(code);
        if (cardTagMatch) {
          const cardPropsString = cardTagMatch[1];
          console.log("Card props string:", cardPropsString);
          
          const paddingMatch = /padding\s*=\s*["']?([^"'\s>]+)["']?/i.exec(cardPropsString);
          if (paddingMatch) {
            cardPropsFromCode.padding = paddingMatch[1];
            console.log("Extracted padding from code:", paddingMatch[1]);
          }
          
          const borderRadiusMatch = /borderRadius\s*=\s*["']?([^"'\s>]+)["']?/i.exec(cardPropsString);
          if (borderRadiusMatch) {
            cardPropsFromCode.borderRadius = borderRadiusMatch[1];
            console.log("Extracted borderRadius from code:", borderRadiusMatch[1]);
          }
          
          const borderColorMatch = /borderColor\s*=\s*["']?([^"'\s>]+)["']?/i.exec(cardPropsString);
          if (borderColorMatch) {
            cardPropsFromCode.borderColor = borderColorMatch[1];
            console.log("Extracted borderColor from code:", borderColorMatch[1]);
          }
        }
        
        const contentFrame = figma.createFrame();
        contentFrame.name = "Card Content";
        contentFrame.layoutMode = "VERTICAL";
        contentFrame.primaryAxisSizingMode = "AUTO";
        contentFrame.counterAxisSizingMode = "AUTO";
        contentFrame.itemSpacing = 16;
        contentFrame.fills = [];
        
        console.log("Created content frame");
        
        contentFrame.x = instance.x + instance.width + 100;
        contentFrame.y = instance.y;
        
        const headingRegex = /<Heading[^>]*>([\s\S]*?)<\/Heading>/i;
        const headingMatch = headingRegex.exec(code);
        if (headingMatch) {
          const headingText = cleanText(headingMatch[1]);
          console.log(`Creating heading: "${headingText}"`);
          
          // Extract color prop from Heading tag
          const headingTag = headingMatch[0];
          const headingColorMatch = /color\s*=\s*["']([^"']+)["']/i.exec(headingTag);
          const headingColor = headingColorMatch ? headingColorMatch[1] : "heading";
          console.log(`Heading color prop: ${headingColor}`);
          
          const textNode = figma.createText();
          textNode.name = "Heading";
          
          const h2Style = figma.getLocalTextStyles().find(style => 
            style.name.toLowerCase().includes("h2") || 
            style.name.toLowerCase().includes("title/h2") ||
            style.name.toLowerCase().includes("desktop title/h2")
          );
          
          if (h2Style) {
            console.log(`Found text style: ${h2Style.name}`);
            await figma.loadFontAsync(h2Style.fontName as FontName);
            textNode.textStyleId = h2Style.id;
            console.log(`✅ Applied text style: ${h2Style.name}`);
          } else {
            console.warn("Could not find h2 text style, using default bold font");
            await figma.loadFontAsync({ family: "Inter", style: "Bold" });
            textNode.fontName = { family: "Inter", style: "Bold" };
            textNode.fontSize = 24;
          }
          
          textNode.characters = headingText;
          
          textNode.textAutoResize = "HEIGHT";
          textNode.resize(400, textNode.height);
          
          await applyColorVariable(textNode, headingColor);
          
          contentFrame.appendChild(textNode);
          console.log("✅ Added heading to content frame");
        }
        
        const textRegex = /<Text[^>]*>([\s\S]*?)<\/Text>/gi;
        const textMatches = [...code.matchAll(textRegex)];
        
        if (textMatches.length > 0) {
          console.log(`Creating ${textMatches.length} text element(s)`);
          
          const textContainer = figma.createFrame();
          textContainer.name = "Text Container";
          textContainer.layoutMode = "VERTICAL";
          textContainer.primaryAxisSizingMode = "AUTO";
          textContainer.counterAxisSizingMode = "AUTO";
          textContainer.itemSpacing = 8;
          textContainer.fills = [];
          
          for (const match of textMatches) {
            const rawText = match[1];
            const textTag = match[0];
            console.log(`Raw text captured: "${rawText}"`);
            const textContent = cleanText(rawText);
            console.log(`Cleaned text: "${textContent}"`);
            
            // Extract color prop from Text tag
            const textColorMatch = /color\s*=\s*["']([^"']+)["']/i.exec(textTag);
            const textColor = textColorMatch ? textColorMatch[1] : "bodyPrimary";
            console.log(`Text color prop: ${textColor}`);
            
            if (textContent) {
              const textNode = figma.createText();
              textNode.name = "Text";
              
              let bodyStyle = figma.getLocalTextStyles().find(style => {
                const styleName = style.name.toLowerCase();
                return (styleName.includes("16r") || styleName.includes("16 r")) && 
                       (styleName.includes("tbody5") || styleName.includes("paragraph"));
              });
              
              if (!bodyStyle) {
                bodyStyle = figma.getLocalTextStyles().find(style => {
                  const styleName = style.name.toLowerCase();
                  return styleName.includes("tbody5") && 
                         (styleName.includes("regular") || styleName.includes("16r"));
                });
              }
              
              if (!bodyStyle) {
                bodyStyle = figma.getLocalTextStyles().find(style => {
                  const styleName = style.name.toLowerCase();
                  return styleName.includes("paragraph") && 
                         styleName.includes("16") && 
                         !styleName.includes("16b");
                });
              }
              
              if (bodyStyle) {
                console.log(`Found body text style: ${bodyStyle.name}`);
                await figma.loadFontAsync(bodyStyle.fontName as FontName);
                textNode.textStyleId = bodyStyle.id;
                console.log(`✅ Applied text style: ${bodyStyle.name}`);
              } else {
                console.warn("Could not find body text style, using default");
                await figma.loadFontAsync({ family: "Inter", style: "Regular" });
                textNode.fontName = { family: "Inter", style: "Regular" };
                textNode.fontSize = 16;
              }
              
              textNode.characters = textContent;
              
              textNode.textAutoResize = "HEIGHT";
              textNode.resize(400, textNode.height);
              
              await applyColorVariable(textNode, textColor);
              
              textContainer.appendChild(textNode);
            }
          }
          
          contentFrame.appendChild(textContainer);
          console.log("✅ Added text elements to content frame");
        }
        
        const buttonRegex = /<Button[^>]*>([\s\S]*?)<\/Button>/gi;
        const buttonMatches = [...code.matchAll(buttonRegex)];
        
        if (buttonMatches.length > 0) {
          console.log(`Creating ${buttonMatches.length} button(s)`);
          
          const buttonContainer = figma.createFrame();
          buttonContainer.name = "Button Container";
          buttonContainer.layoutMode = "HORIZONTAL";
          buttonContainer.primaryAxisSizingMode = "AUTO";
          buttonContainer.counterAxisSizingMode = "AUTO";
          buttonContainer.itemSpacing = 12;
          buttonContainer.fills = [];
          
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
            buttonComponent = figma.currentPage.findOne(
              (node) => node.type === "COMPONENT_SET" && node.name.toLowerCase().includes("button")
            ) as ComponentSetNode;
          }
          
          if (buttonComponent) {
            console.log("Found Button component:", buttonComponent.name);
            console.log(`Processing ${buttonMatches.length} button(s)...`);
            
            for (let i = 0; i < buttonMatches.length; i++) {
              const match = buttonMatches[i];
              const buttonContent = cleanText(match[1]);
              const buttonTag = match[0];
              
              console.log(`\n=== Processing Button ${i + 1}/${buttonMatches.length} ===`);
              console.log(`Button text: "${buttonContent}"`);
              console.log(`Button tag: ${buttonTag.substring(0, 100)}...`);
              
              const variantMatch = /variant\s*=\s*["']([^"']+)["']/i.exec(buttonTag);
              const intentMatch = /intent\s*=\s*["']([^"']+)["']/i.exec(buttonTag);
              const sizeMatch = /size\s*=\s*["']([^"']+)["']/i.exec(buttonTag);
              
              const defaultVariant = buttonComponent.defaultVariant || buttonComponent.children[0] as ComponentNode;
              const buttonInstance = defaultVariant.createInstance();
              
              const buttonPropsToSet: Record<string, any> = {};
              
              if (variantMatch) {
                const variant = variantMatch[1];
                buttonPropsToSet.variant = variant;
              } else {
                buttonPropsToSet.variant = "filled";
              }
              
              if (intentMatch) {
                buttonPropsToSet.intent = intentMatch[1];
              } else {
                buttonPropsToSet.intent = "primary";
              }
              
              if (sizeMatch) {
                buttonPropsToSet.size = sizeMatch[1];
              } else {
                buttonPropsToSet.size = "lg";
              }
              
              buttonPropsToSet.state = "default";
              
              console.log(`Button properties to set:`, buttonPropsToSet);
              
              let propertiesSet = false;
              
              try {
                buttonInstance.setProperties(buttonPropsToSet);
                console.log(`✅ Set button properties successfully:`, buttonPropsToSet);
                propertiesSet = true;
              } catch (propError) {
                console.warn(`⚠️ Strategy 1 failed (exact match):`, propError);
              }
              
              if (!propertiesSet && buttonPropsToSet.variant === "outline" && buttonPropsToSet.intent === "secondary") {
                try {
                  const outlinePrimaryProps = {
                    ...buttonPropsToSet,
                    intent: "primary"
                  };
                  buttonInstance.setProperties(outlinePrimaryProps);
                  console.log(`✅ Set button with outline + primary (secondary not available):`, outlinePrimaryProps);
                  propertiesSet = true;
                } catch (propError) {
                  console.warn(`⚠️ Strategy 2 failed (outline + primary):`, propError);
                }
              }
              
              if (!propertiesSet) {
                try {
                  const propsWithoutSize = { ...buttonPropsToSet };
                  delete propsWithoutSize.size;
                  buttonInstance.setProperties(propsWithoutSize);
                  console.log(`✅ Set button properties without size:`, propsWithoutSize);
                  propertiesSet = true;
                } catch (propError) {
                  console.warn(`⚠️ Strategy 3 failed (without size):`, propError);
                }
              }
              
              if (!propertiesSet && buttonPropsToSet.variant === "outline") {
                try {
                  const textVariantProps = {
                    ...buttonPropsToSet,
                    variant: "text"
                  };
                  buttonInstance.setProperties(textVariantProps);
                  console.log(`✅ Set button with text variant (outline not available):`, textVariantProps);
                  propertiesSet = true;
                } catch (propError) {
                  console.warn(`⚠️ Strategy 4 failed (text variant):`, propError);
                }
              }
              
              if (!propertiesSet) {
                try {
                  const filledProps = {
                    ...buttonPropsToSet,
                    variant: "filled"
                  };
                  buttonInstance.setProperties(filledProps);
                  console.log(`✅ Set button with filled variant fallback:`, filledProps);
                  propertiesSet = true;
                } catch (propError) {
                  console.warn(`⚠️ Strategy 5 failed (filled fallback):`, propError);
                }
              }
              
              if (!propertiesSet) {
                try {
                  const safeProps = {
                    variant: "filled",
                    intent: "primary",
                    size: "lg",
                    state: "default"
                  };
                  buttonInstance.setProperties(safeProps);
                  console.log(`✅ Set button with safe fallback properties:`, safeProps);
                  propertiesSet = true;
                } catch (propError) {
                  console.error(`❌ All strategies failed:`, propError);
                }
              }
              
              if (!propertiesSet) {
                console.error(`❌ Could not set any button properties for: ${buttonContent}`);
              }
              
              const buttonTextNodes = buttonInstance.findAll(node => node.type === "TEXT") as TextNode[];
              if (buttonTextNodes.length > 0 && buttonContent) {
                const textNode = buttonTextNodes[0];
                await figma.loadFontAsync(textNode.fontName as FontName);
                textNode.characters = buttonContent;
              }
              
              buttonContainer.appendChild(buttonInstance);
              console.log(`✅ Button ${i + 1} complete: "${buttonContent}"`);
              console.log(`=== End Button ${i + 1} ===\n`);
            }
            
            contentFrame.appendChild(buttonContainer);
          } else {
            console.warn("Button component not found - skipping button creation");
          }
        }
        
        console.log("=== STAGE 2: Setting up Card with Content ===");
        
        const cardSettings = instance.findOne(node => {
          if (node.type !== "INSTANCE") return false;
          const mainComp = (node as InstanceNode).mainComponent;
          if (!mainComp) return false;
          
          const compName = mainComp.name.replace(/^[^\w\s]+\s*/, '').trim().toLowerCase();
          const parentCompSet = mainComp.parent;
          const parentName = parentCompSet && parentCompSet.type === "COMPONENT_SET" 
            ? parentCompSet.name.replace(/^[^\w\s]+\s*/, '').trim().toLowerCase()
            : "";
          
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
          
          const cardSettingsProps: Record<string, any> = {};
          const cardSettingsAvailableProps = Object.keys(cardSettings.componentProperties || {});
          console.log("Card Settings available properties:", cardSettingsAvailableProps);
          console.log("Card Settings property definitions:");
          Object.entries(cardSettings.componentProperties || {}).forEach(([key, prop]) => {
            console.log(`  ${key}: type=${prop.type}, value=${prop.value}`);
          });
          
          if (cardPropsFromCode.padding) {
            const paddingValue = valueMapping.padding?.[cardPropsFromCode.padding];
            if (paddingValue) {
              cardSettingsProps.padding = paddingValue;
              console.log(`Mapping padding "${cardPropsFromCode.padding}" to "${paddingValue}"`);
            } else {
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
              cardSettingsProps.borderRadius = cardPropsFromCode.borderRadius;
              console.log(`Using raw borderRadius value: "${cardPropsFromCode.borderRadius}"`);
            }
          }
          
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
        
        const contentComponent = figma.createComponent();
        contentComponent.name = "Card Content - " + Date.now();
        contentComponent.layoutMode = contentFrame.layoutMode;
        contentComponent.primaryAxisSizingMode = contentFrame.primaryAxisSizingMode;
        contentComponent.counterAxisSizingMode = contentFrame.counterAxisSizingMode;
        contentComponent.itemSpacing = contentFrame.itemSpacing;
        contentComponent.fills = contentFrame.fills;
        
        contentComponent.x = contentFrame.x;
        contentComponent.y = contentFrame.y;
        
        const childrenToCopy = [...contentFrame.children];
        for (const child of childrenToCopy) {
          contentComponent.appendChild(child);
        }
        
        contentFrame.remove();
        
        console.log("✅ Created component:", contentComponent.name);
        
        if (cardSettings) {
          const swapProperty = Object.keys(cardSettings.componentProperties || {}).find(key => 
            key.toLowerCase().includes("replace") || 
            key.toLowerCase().includes("local component")
          );
          
          if (swapProperty) {
            console.log(`Found instance swap property: "${swapProperty}"`);
            
            try {
              cardSettings.setProperties({
                [swapProperty]: contentComponent.id
              });
              
              console.log("✅ Successfully swapped in content component!");
              figma.notify("✅ Card created with content inside!", { timeout: 3000 });
              
              figma.currentPage.selection = [instance];
              figma.viewport.scrollAndZoomIntoView([instance]);
            } catch (error) {
              console.error("❌ Error swapping component:", error);
              
              figma.currentPage.selection = [instance, contentComponent];
              figma.viewport.scrollAndZoomIntoView([instance, contentComponent]);
              
              figma.notify(
                "✅ Card & Content created!\n\nManual step needed:\n1. Select the Card\n2. Use '🔁 Replace with Local component' to select 'Card Content'",
                { timeout: 10000 }
              );
            }
          } else {
            console.warn("Could not find instance swap property");
            
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

      if (Object.keys(textPropertiesToSet).length > 0) {
        const instanceTextNodes = instance.findAll(node => node.type === "TEXT") as TextNode[];
        
        console.log(`Found ${instanceTextNodes.length} text node(s) in instance`);
        console.log("Text properties to set:", textPropertiesToSet);
        
        if (instanceTextNodes.length === 0) {
          console.error("No text nodes found in instance");
          figma.notify("⚠️ No text nodes found in component", { timeout: 3000 });
        } else {
          if (textPropertiesToSet["buttonText"]) {
            const buttonText = textPropertiesToSet["buttonText"];
            console.log(`Setting button text to: "${buttonText}"`);
            
            let targetTextNode: TextNode | null = null;
            
            for (const textNode of instanceTextNodes) {
              const nodeName = textNode.name.toLowerCase();
              if (nodeName.includes("label") || 
                  nodeName.includes("text") || 
                  nodeName.includes("button") ||
                  textNode.characters.includes("Button") ||
                  textNode.characters.includes("Test")) {
                targetTextNode = textNode;
                console.log(`Found button text node: ${textNode.name}`);
                break;
              }
            }
            
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
            
            delete textPropertiesToSet["buttonText"];
          }
          
          for (const [propName, propValue] of Object.entries(textPropertiesToSet)) {
            console.log(`Looking for text node for property "${propName}" with value "${propValue}"`);
            
            let targetTextNode: TextNode | null = null;
            
            if (instanceTextNodes.length === 1) {
              targetTextNode = instanceTextNodes[0];
              console.log("Using single text node");
            } else {
              for (const textNode of instanceTextNodes) {
                const boundVar = textNode.boundVariables?.characters;
                if (boundVar) {
                  console.log(`Found text node with bound variable: ${boundVar.id}`);
                  targetTextNode = textNode;
                  break;
                }
              }
              
              if (!targetTextNode) {
                targetTextNode = instanceTextNodes[0];
                console.log("Using first text node as fallback");
              }
            }
            
            if (targetTextNode) {
              try {
                const currentText = targetTextNode.characters;
                console.log(`Current text in node: "${currentText}"`);
                
                await figma.loadFontAsync(targetTextNode.fontName as FontName);
                targetTextNode.characters = propValue;
                
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

      if (imageUrl) {
        console.log(`Processing image URL: ${imageUrl}`);
        figma.notify("🖼️ Fetching image...", { timeout: 2000 });
        
        try {
          const response = await fetch(imageUrl);
          if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
          }
          
          const arrayBuffer = await response.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          
          const image = figma.createImage(uint8Array);
          const imageHash = image.hash;
          
          console.log(`Image loaded successfully. Hash: ${imageHash}`);
          
          const imageLayer = instance.findOne(node => {
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

      figma.currentPage.selection = [instance];
      figma.viewport.scrollAndZoomIntoView([instance]);

      emit("AVATAR_CREATED");

    } catch (error) {
      figma.notify(`❌ Error: ${(error as Error).message}`, { error: true });
      console.error("Plugin error:", error);
      
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
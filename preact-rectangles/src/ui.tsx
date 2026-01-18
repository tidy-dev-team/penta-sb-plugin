import {
  Button,
  Columns,
  Container,
  Muted,
  render,
  Text,
  TextboxMultiline,
  VerticalSpace,
  LoadingIndicator,
  Dropdown,
  DropdownOption,
} from "@create-figma-plugin/ui";
import { emit, on } from "@create-figma-plugin/utilities";
import { h, JSX, Fragment } from "preact";
import { useCallback, useState, useEffect } from "preact/hooks";

import {
  CloseHandler,
  CreateAvatarHandler,
  AvatarCreatedHandler,
} from "./types";

import "!./styles.css";

function Plugin() {
  const [value, setValue] = useState<string>("");
  const [result, setResult] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [componentName, setComponentName] = useState<string>("card"); // Changed default to "card"

  // Listen for avatar creation completion at the top level
  useEffect(() => {
    console.log("Setting up AVATAR_CREATED listener");
    return on<AvatarCreatedHandler>("AVATAR_CREATED", () => {
      console.log("=== AVATAR_CREATED event received ===");
      setIsProcessing(false);
      console.log("Set isProcessing to false");
      
      // Close after a brief delay to let user see the result
      setTimeout(() => {
        console.log("Closing plugin...");
        emit<CloseHandler>("CLOSE");
      }, 1000);
    });
  }, []);

  const handleInput = useCallback(
    function (event: JSX.TargetedEvent<HTMLTextAreaElement>) {
      const newValue = event.currentTarget.value;
      setValue(newValue);
      // Removed auto-detection logic
    },
    []
  );

  const handleComponentNameChange = useCallback(function (
    event: JSX.TargetedEvent<HTMLInputElement>
  ) {
    const newValue = event.currentTarget.value;
    setComponentName(newValue);
  },
  []);

  const parseComponentProps = (code: string, componentType: string) => {
    const props: Record<string, any> = {};

    // Create regex based on component type
    // Updated to handle components with no props: <Button>...</Button>
    const componentRegex = new RegExp(
      `<${
        componentType.charAt(0).toUpperCase() + componentType.slice(1)
      }\\s*([\\s\\S]*?)(?:>([\\s\\S]*?)<\\/|\\/>)`,
      "gi"
    );
    const match = componentRegex.exec(code);

    if (!match) {
      return null;
    }

    const propsString = match[1];
    const children = match[2];

    // If there are children (text content), add it to props
    // For buttons, the text content is just "children" - Figma will use it as the label
    if (children && children.trim()) {
      if (componentType === "button") {
        props.children = children.trim();
      } else {
        props.children = children.trim();
      }
    }

    // Parse individual props
    // Handle string props: prop="value" or prop='value'
    const stringPropRegex = /(\w+)=["']([^"']+)["']/g;
    let propMatch;

    while ((propMatch = stringPropRegex.exec(propsString)) !== null) {
      const propName = propMatch[1];
      const propValue = propMatch[2];

      // Direct mapping for button props - no transformation needed
      props[propName] = propValue;
    }

    // Handle JSX element props: prop={<Component />}
    const jsxPropRegex = /(\w+)=\{<([^>]+)\s*\/>\}/g;
    while ((propMatch = jsxPropRegex.exec(propsString)) !== null) {
      const propName = propMatch[1];
      const propValue = propMatch[2];

      // For buttons, map iconL/iconR to Figma's boolean toggles
      if (componentType === "button") {
        if (propName === "iconL" || propName === "leftIcon") {
          props["With left icon"] = true;
        } else if (propName === "iconR" || propName === "rightIcon") {
          props["With right icon"] = true;
        } else {
          props[propName] = `<${propValue} />`;
        }
      } else {
        props[propName] = `<${propValue} />`;
      }
    }

    // Handle boolean props: prop={true/false} or just prop (true)
    const booleanPropRegex = /(\w+)(?:=\{(true|false)\}|\s|\/|>)/g;
    while ((propMatch = booleanPropRegex.exec(propsString)) !== null) {
      const propName = propMatch[1];
      const propValue = propMatch[2];

      // Skip if already captured by other regex
      if (props[propName]) continue;

      // Map specific boolean props for buttons
      if (componentType === "button") {
        // Map common boolean prop names to Figma's naming
        if (propName === "loading") {
          props.loading = propValue === "true" || !propValue;
        } else if (propName === "disabled") {
          props.disabled = propValue === "true" || !propValue;
        } else if (!propValue && !props[propName]) {
          props[propName] = true;
        } else if (propValue) {
          props[propName] = propValue === "true";
        }
      } else {
        // If no explicit value, it's a truthy boolean prop
        if (!propValue && !props[propName]) {
          props[propName] = true;
        } else if (propValue) {
          props[propName] = propValue === "true";
        }
      }
    }

    // Handle number props: prop={123}
    const numberPropRegex = /(\w+)=\{(\d+)\}/g;
    while ((propMatch = numberPropRegex.exec(propsString)) !== null) {
      props[propMatch[1]] = parseInt(propMatch[2], 10);
    }

    return props;
  };

  const handleCreateComponent = useCallback(
    function () {
      console.log("=== handleCreateComponent called ===");
      console.log("Value:", value);
      console.log("Component name:", componentName);
      
      if (!value.trim()) {
        setResult("Please paste Storybook code first");
        return;
      }

      if (!componentName.trim()) {
        setResult("Please select a component type");
        return;
      }

      setIsProcessing(true);
      setResult("");
      console.log("Set isProcessing to true");

      try {
        const props = parseComponentProps(value, componentName);
        console.log("=== Parsed props ===");
        console.log(props);

        if (!props) {
          const exampleCode =
            componentName === "title"
              ? '<Title name="John Doe" size="large" />'
              : componentName === "card"
              ? '<Card padding="6" borderRadius="xl">\n  <Heading>Card Title</Heading>\n  <Text>Card content</Text>\n</Card>'
              : '<Button size="lg" intent="primary" variant="filled">Button Text</Button>';

          setResult(
            `No ${
              componentName.charAt(0).toUpperCase() + componentName.slice(1)
            } component found in the pasted code.\n\nMake sure your code includes something like:\n${exampleCode}`
          );
          setIsProcessing(false);
          return;
        }

        console.log("Parsed props:", props);

        // Add default values for buttons if not specified
        if (componentName === "button") {
          if (!props.size) {
            props.size = "lg"; // Default to large size
          }
          if (!props.variant) {
            props.variant = "filled"; // Default to filled variant
          }
          if (!props.intent) {
            props.intent = "primary"; // Default to primary intent
          }
          if (!props.state) {
            props.state = "default"; // Default state
          }
        }

        console.log("=== Emitting CREATE_AVATAR event ===");
        console.log("Props to send:", props);
        console.log("Component name:", componentName);
        
        // Send props, component name, and original code to main thread
        emit<CreateAvatarHandler>("CREATE_AVATAR", {
          props,
          componentName,
          code: value,
        } as any);
        
        console.log("Event emitted successfully");

        setResult(
          `${componentName} will be created with props:\n\n${JSON.stringify(
            props,
            null,
            2
          )}\n\nCheck your Figma canvas!`
        );
        
        // Don't set isProcessing to false here - wait for AVATAR_CREATED event
        console.log("Waiting for AVATAR_CREATED event...");
      } catch (error) {
        console.error("Error in handleCreateComponent:", error);
        setResult(
          `Error parsing ${componentName} props: ` + (error as Error).message
        );
        setIsProcessing(false);
      }

      // Plugin will auto-close when main thread emits "AVATAR_CREATED"
    },
    [value, componentName]
  );

  const handleCloseButtonClick = useCallback(function () {
    emit<CloseHandler>("CLOSE");
  }, []);

  const componentOptions: Array<DropdownOption> = [
    { value: "card", text: "Card" },
    { value: "button", text: "Button" },
    { value: "title", text: "Heading" },
  ];

  const placeholderText =
    componentName === "title"
      ? `Paste your Storybook code here...\n\nExample:\n<Title\n  name="John Doe"\n  size="large"\n  variant="circle"\n  showStatus={true}\n/>`
      : componentName === "card"
      ? `Paste your Storybook code here...\n\nExample:\n<Card padding="6" borderRadius="xl">\n  <Heading>Card Title</Heading>\n  <Text>Card content here</Text>\n  <Button>Action</Button>\n</Card>`
      : `Paste your Storybook code here...\n\nExample:\n<Button\n  size="lg"\n  intent="primary"\n  variant="filled"\n  iconL={<Plus />}\n  disabled={false}\n>\n  Button Text\n</Button>`;

  return (
    <Container space="medium">
      <VerticalSpace space="large" />
      <Text>
        <Muted>Figma Component Name</Muted>
      </Text>
      <VerticalSpace space="extraSmall" />
      <Dropdown
        onChange={handleComponentNameChange}
        options={componentOptions}
        value={componentName}
      />
      <VerticalSpace space="medium" />
      <Text>
        <Muted>
          Paste Storybook{" "}
          {componentName.charAt(0).toUpperCase() + componentName.slice(1)}{" "}
          Implementation
        </Muted>
      </Text>
      <VerticalSpace space="small" />
      <TextboxMultiline
        onInput={handleInput}
        value={value}
        rows={10}
        placeholder={placeholderText}
      />
      <VerticalSpace space="medium" />
      <Button fullWidth onClick={handleCreateComponent} disabled={isProcessing}>
        {isProcessing ? "Building..." : "Build on Canvas"}
      </Button>
      {isProcessing && (
        <Fragment>
          <VerticalSpace space="small" />
          <LoadingIndicator />
        </Fragment>
      )}
      {result && (
        <Fragment>
          <VerticalSpace space="medium" />
          <Text>
            <Muted>Result:</Muted>
          </Text>
          <VerticalSpace space="small" />
          <TextboxMultiline value={result} rows={8} disabled />
        </Fragment>
      )}
      <VerticalSpace space="extraSmall" />
      <Columns space="extraSmall">
        <Button fullWidth onClick={handleCloseButtonClick} secondary>
          Close
        </Button>
      </Columns>
      <VerticalSpace space="small" />
    </Container>
  );
}

export default render(Plugin);
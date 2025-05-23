import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { menuItems } from '@/data/menu-items';
import { 
  Card, 
  CardContent, 
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription 
} from '@/components/ui/card';
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue, 
} from '@/components/ui/select';
import { Calendar as CalendarIcon, X, Plus, Minus, Vegan, EggOff, MilkOff, WheatOff, Star } from 'lucide-react';
import { format } from 'date-fns';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Badge } from '@/components/ui/badge';
import emailjs from '@emailjs/browser';
import { orderEmailTemplate, customerOrderEmailTemplate } from '@/email-templates';
import { useMenu } from '@/contexts/MenuContext';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { MenuItem } from '@/types/menu';
import { useOrder } from '@/contexts/OrderContext';

// Constants
const EMAILJS_PUBLIC_KEY = "jRgg2OkLA0U1pS4WQ";
const EMAILJS_SERVICE_ID = "service_10tkiq3";
const EMAILJS_TEMPLATE_ID = "template_34tuje7";
const BAKERY_EMAIL = "myjilicioustreats@gmail.com";

// Dietary options with consistent styling
const dietaryOptions = [
  { id: "vegan", label: "Vegan", icon: <Vegan className="mr-1.5" /> },
  { id: "glutenFree", label: "Gluten Free", icon: <WheatOff className="mr-1.5" /> },
  { id: "dairyFree", label: "Dairy Free", icon: <MilkOff className="mr-1.5" /> },
  { id: "nutFree", label: "Nut Free", icon: <EggOff className="mr-1.5" /> },
  { id: "halal", label: "Halal", icon: <img src="/images/halalwhite.jpg" alt="Halal" className="w-4 h-4 mr-1.5" /> },
  { id: "kosher", label: "Kosher", icon: <Star className="mr-1.5 text-purple-600" /> }
] as const;

// Pickup time options
const PICKUP_TIMES = [
  "9:00 AM", "9:30 AM", "10:00 AM", "10:30 AM", 
  "11:00 AM", "11:30 AM", "12:00 PM", "12:30 PM",
  "1:00 PM", "1:30 PM", "2:00 PM", "2:30 PM", 
  "3:00 PM", "3:30 PM", "4:00 PM", "4:30 PM",
  "5:00 PM"
] as const;

// Define form schema
const orderFormSchema = z.object({
  name: z.string().min(2, { message: 'Name must be at least 2 characters' }).refine(val => val.trim().length > 0, {
    message: 'Name is required'
  }),
  email: z.string().email({ message: 'Please enter a valid email address' }).refine(val => val.trim().length > 0, {
    message: 'Email is required'
  }),
  phone: z.string()
    .min(12, { message: 'Please enter a valid phone number (xxx-xxx-xxxx)' })
    .max(12, { message: 'Please enter a valid phone number (xxx-xxx-xxxx)' })
    .refine(val => val.trim().length > 0, {
      message: 'Phone number is required'
    })
    .refine(val => /^\d{3}-\d{3}-\d{4}$/.test(val), {
      message: 'Please enter a valid phone number (xxx-xxx-xxxx)'
    }),
  inStockPickupDate: z.date({
    required_error: "Please select a pickup date for in-stock items",
  }),
  inStockPickupTime: z.string({
    required_error: "Please select a pickup time for in-stock items",
  }),
  madeToOrderPickupDate: z.date({
    required_error: "Please select a pickup date for made-to-order items",
  }),
  madeToOrderPickupTime: z.string({
    required_error: "Please select a pickup time for made-to-order items",
  }),
  specialInstructions: z.string().optional(),
});

type OrderFormValues = z.infer<typeof orderFormSchema>;

// Initial values for the form
const defaultValues: Partial<OrderFormValues> = {
  name: '',
  email: '',
  phone: '',
  inStockPickupDate: undefined,
  inStockPickupTime: undefined,
  madeToOrderPickupDate: undefined,
  madeToOrderPickupTime: undefined,
  specialInstructions: '',
};

// Type for cart items
interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

// Helper functions
const formatOrderDetails = (cart: CartItem[], menuItems: MenuItem[]) => {
  const inStockItems = cart.filter(item => {
    const menuItem = menuItems.find(mi => mi.id === item.id);
    return menuItem && !menuItem.madeToOrder;
  });

  const madeToOrderItems = cart.filter(item => {
    const menuItem = menuItems.find(mi => mi.id === item.id);
    return menuItem && menuItem.madeToOrder;
  });

  const cartTotal = cart.reduce((total, item) => total + (Number(item.price || 0) * item.quantity), 0);

  return {
    inStockItems,
    madeToOrderItems,
    cartTotal
  };
};

const formatPhoneNumber = (value: string) => {
  const digits = value.replace(/\D/g, '');
  let formattedValue = '';
  if (digits.length > 0) {
    formattedValue = digits.slice(0, 3);
    if (digits.length > 3) {
      formattedValue += '-' + digits.slice(3, 6);
    }
    if (digits.length > 6) {
      formattedValue += '-' + digits.slice(6, 10);
    }
  }
  return formattedValue;
};

const getAvailablePickupDates = (hasMadeToOrderItems: boolean) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const currentDay = now.getDay();
  const currentHour = now.getHours();

  if (hasMadeToOrderItems) {
    // For made-to-order items, only allow Saturdays
    const daysUntilNextSaturday = (6 - currentDay + 7) % 7;
    const upcomingSaturday = new Date(today);
    upcomingSaturday.setDate(today.getDate() + daysUntilNextSaturday);

    const saturdayAfterNext = new Date(upcomingSaturday);
    saturdayAfterNext.setDate(upcomingSaturday.getDate() + 7);

    // If past Wednesday or Wednesday after 6 PM
    if (currentDay > 3 || (currentDay === 3 && currentHour >= 18)) {
      return saturdayAfterNext;
    }
    return upcomingSaturday;
  }

  // For in-stock items, allow weekdays
  const minPickupDate = new Date(today);
  minPickupDate.setDate(today.getDate() + 1);
  return minPickupDate;
};

// Add payment instructions component
const PaymentInstructions = () => (
  <div className="bg-bakery-gold/10 border border-bakery-gold/30 rounded-lg p-6 mb-6">
    <h2 className="text-xl font-serif font-semibold text-bakery-brown mb-4">
      Payment Instructions
    </h2>
    <div className="space-y-4">
      <div>
        <h3 className="font-medium text-bakery-brown mb-2">Zelle Payment</h3>
        <p className="text-gray-700">
          Send payment to: <span className="font-semibold">myjilicioustreats@gmail.com</span>
        </p>
        <p className="text-sm text-gray-600 mt-1">
          Please include your order number in the memo field when sending payment.
        </p>
      </div>
      <div>
        <h3 className="font-medium text-bakery-brown mb-2">Cash Payment</h3>
        <p className="text-gray-700">
          Pay with cash when picking up your order.
        </p>
      </div>
      <p className="text-sm text-gray-600 mt-2">
        Note: Your order will be confirmed once payment is received or when you arrive for pickup with cash.
      </p>
    </div>
  </div>
);

const OrderPage = () => {
  const [searchParams] = useSearchParams();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedDietary, setSelectedDietary] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { menuItems, categories } = useMenu();
  const { addOrder } = useOrder();

  // Split cart items into in-stock and made-to-order
  const { inStockItems, madeToOrderItems, cartTotal } = formatOrderDetails(cart, menuItems);

  // Create validation schema with access to cart items
  const createValidationSchema = () => {
    return orderFormSchema.refine((data) => {
      // First check if cart is empty
      if (cart.length === 0) {
        return false;
      }

      // If there are in-stock items, require in-stock pickup details
      if (inStockItems.length > 0) {
        if (!data.inStockPickupDate || !data.inStockPickupTime) {
          return false;
        }
      }
      // If there are made-to-order items, require made-to-order pickup details
      if (madeToOrderItems.length > 0) {
        if (!data.madeToOrderPickupDate || !data.madeToOrderPickupTime) {
          return false;
        }
      }
      return true;
    }, {
      message: cart.length === 0 
        ? "Please add items to your cart before submitting your order" 
        : "Please select pickup date and time for all items",
      path: ["inStockPickupDate", "madeToOrderPickupDate"]
    });
  };

  // Create form with dynamic validation
  const form = useForm<OrderFormValues>({
    resolver: zodResolver(createValidationSchema()),
    defaultValues,
    mode: "onChange"
  });

  // Get the item ID from URL search params and add to cart if it exists
  useEffect(() => {
    const itemId = searchParams.get('item');
    if (itemId) {
      const menuItem = menuItems.find(item => item.id === itemId);
      if (menuItem && !cart.some(item => item.id === itemId)) {
        setCart(prevCart => [...prevCart, {
          id: menuItem.id,
          name: menuItem.name,
          price: menuItem.price,
          quantity: 1
        }]);
      }
    }
  }, [searchParams, cart]);

  // Filter menu items based on selected category and dietary restrictions
  const filteredMenuItems = menuItems.filter(item => {
    // Filter by category
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
    
    // Filter by dietary restrictions if any are selected
    const matchesDietary = selectedDietary.length === 0 || selectedDietary.every(restriction => 
      item.dietaryInfo[restriction as keyof typeof item.dietaryInfo]
    );
    
    return matchesCategory && matchesDietary;
  });

  // Determine if order contains made-to-order items
  const hasMadeToOrderItems = madeToOrderItems.length > 0;

  // Get available pickup dates based on order type
  const getAvailablePickupDates = (date: Date) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // If order contains made-to-order items
    if (hasMadeToOrderItems) {
      // First, ensure we're only allowing Saturdays
      if (date.getDay() !== 6) {
        return false;
      }

      // Get the current day of the week (0 = Sunday, 1 = Monday, etc.)
      const currentDay = now.getDay();
      const currentHour = now.getHours();

      // Calculate the date of the upcoming Saturday
      const daysUntilNextSaturday = (6 - currentDay + 7) % 7;
      const upcomingSaturday = new Date(today);
      upcomingSaturday.setDate(today.getDate() + daysUntilNextSaturday);

      // Calculate the date of the Saturday after next
      const saturdayAfterNext = new Date(upcomingSaturday);
      saturdayAfterNext.setDate(upcomingSaturday.getDate() + 7);

      // If we're past Wednesday (Thursday, Friday, Saturday, Sunday) or it's Wednesday after 6 PM
      if (currentDay > 3 || (currentDay === 3 && currentHour >= 18)) {
        // Only allow dates on or after the Saturday after next
        return date >= saturdayAfterNext;
      } else {
        // Before Wednesday 6 PM, allow the upcoming Saturday
        return date >= upcomingSaturday;
      }
    } else {
      // For in-stock items only
      const isWeekday = date.getDay() >= 1 && date.getDay() <= 5; // Monday through Friday
      const minPickupDate = new Date(today);
      minPickupDate.setDate(today.getDate() + 1); // Next day pickup
      
      return isWeekday && date >= minPickupDate;
    }
  };

  // Get available pickup times based on order type
  const getAvailablePickupTimes = () => {
    if (hasMadeToOrderItems) {
      // For made-to-order items, available all day
      return [
        "9:00 AM", "9:30 AM", "10:00 AM", "10:30 AM", 
        "11:00 AM", "11:30 AM", "12:00 PM", "12:30 PM",
        "1:00 PM", "1:30 PM", "2:00 PM", "2:30 PM", 
        "3:00 PM", "3:30 PM", "4:00 PM", "4:30 PM",
        "5:00 PM", "5:30 PM", "6:00 PM"
      ];
    } else {
      // For in-stock items, noon to 6 PM
      return [
        "12:00 PM", "12:30 PM", "1:00 PM", "1:30 PM",
        "2:00 PM", "2:30 PM", "3:00 PM", "3:30 PM",
        "4:00 PM", "4:30 PM", "5:00 PM", "5:30 PM",
        "6:00 PM"
      ];
    }
  };

  // Handle adding item to cart
  const addToCart = (item: typeof menuItems[0]) => {
    const existingItem = cart.find(cartItem => cartItem.id === item.id);
    
    // Check if item is made to order or has stock available
    if (!item.madeToOrder && item.stock <= 0) {
      toast({
        title: "Out of stock",
        description: `${item.name} is currently out of stock.`,
        variant: "destructive"
      });
      return;
    }

    // Check if adding one more would exceed stock
    if (!item.madeToOrder && existingItem && existingItem.quantity >= item.stock) {
      toast({
        title: "Stock limit reached",
        description: `Only ${item.stock} ${item.name} available.`,
        variant: "destructive"
      });
      return;
    }
    
    if (existingItem) {
      setCart(cart.map(cartItem => 
        cartItem.id === item.id 
          ? { ...cartItem, quantity: cartItem.quantity + 1 } 
          : cartItem
      ));
    } else {
      setCart([...cart, {
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: 1
      }]);
    }

    toast({
      title: "Item added to cart",
      description: `${item.name} has been added to your order.`,
    });
  };

  // Handle removing item from cart
  const removeFromCart = (id: string) => {
    setCart(cart.filter(item => item.id !== id));
  };

  // Update item quantity
  const updateQuantity = (id: string, quantity: number) => {
    if (quantity < 1) {
      removeFromCart(id);
      return;
    }

    const menuItem = menuItems.find(item => item.id === id);
    if (!menuItem?.madeToOrder && quantity > menuItem!.stock) {
      toast({
        title: "Stock limit reached",
        description: `Only ${menuItem!.stock} ${menuItem!.name} available.`,
        variant: "destructive"
      });
      return;
    }

    setCart(cart.map(item => 
      item.id === id ? { ...item, quantity } : item
    ));
  };

  // Handle dietary filter toggle
  const handleDietaryToggle = (value: string[]) => {
    setSelectedDietary(value);
  };

  // Handle form submission
  const onSubmit = async (data: OrderFormValues) => {
    if (isSubmitting || cart.length === 0) return;

    try {
      setIsSubmitting(true);

      const { inStockItems, madeToOrderItems, cartTotal } = formatOrderDetails(cart, menuItems);

      // Prepare email template parameters
      const templateParams = {
        to_email: data.email,
        name: 'Ji\'licious Treats',
        email: BAKERY_EMAIL,
        customer_name: data.name,
        customer_email: data.email,
        customer_phone: data.phone,
        contact_info: `Customer Contact Information:\nName: ${data.name}\nEmail: ${data.email}\nPhone: ${data.phone}`,
        phone: data.phone,
        logo_url: 'https://crumb-and-connect.vercel.app/images/logo.png',
        in_stock_pickup_date: data.inStockPickupDate ? format(data.inStockPickupDate, 'MMMM d, yyyy') : 'Not applicable',
        in_stock_pickup_time: data.inStockPickupTime || 'Not applicable',
        made_to_order_pickup_date: data.madeToOrderPickupDate ? format(data.madeToOrderPickupDate, 'MMMM d, yyyy') : 'Not applicable',
        made_to_order_pickup_time: data.madeToOrderPickupTime || 'Not applicable',
        special_instructions: data.specialInstructions || 'None',
        in_stock_items: inStockItems.length > 0 ? inStockItems.map(item => 
          `${item.name} x${item.quantity} - $${(Number(item.price || 0) * item.quantity).toFixed(2)}`
        ).join('\n') : 'No in-stock items ordered',
        made_to_order_items: madeToOrderItems.length > 0 ? madeToOrderItems.map(item => 
          `${item.name} x${item.quantity} - $${(Number(item.price || 0) * item.quantity).toFixed(2)}`
        ).join('\n') : 'No made-to-order items ordered',
        total_amount: `$${Number(cartTotal || 0).toFixed(2)}`,
        payment_instructions: `Payment Instructions:\n\n1. Zelle Payment:\nSend payment to: ${BAKERY_EMAIL}\nInclude order number in memo\n\n2. Cash Payment:\nPay with cash when picking up your order\n\nNote: Your order will be confirmed once payment is received or when you arrive for pickup with cash.`
      };

      // Send emails in parallel
      const emailPromises = [
        // Customer email
        emailjs.send(
          EMAILJS_SERVICE_ID,
          EMAILJS_TEMPLATE_ID,
          templateParams,
          { publicKey: EMAILJS_PUBLIC_KEY }
        ),
        // Bakery email
        emailjs.send(
          EMAILJS_SERVICE_ID,
          EMAILJS_TEMPLATE_ID,
          { ...templateParams, to_email: BAKERY_EMAIL },
          { publicKey: EMAILJS_PUBLIC_KEY }
        )
      ];

      await Promise.all(emailPromises);

      // Add order to the system
      await addOrder({
        customerName: data.name,
        customerEmail: data.email,
        customerPhone: data.phone,
        inStockItems,
        madeToOrderItems,
        inStockPickupDate: data.inStockPickupDate,
        inStockPickupTime: data.inStockPickupTime,
        madeToOrderPickupDate: data.madeToOrderPickupDate,
        madeToOrderPickupTime: data.madeToOrderPickupTime,
        total: cartTotal,
        specialInstructions: data.specialInstructions,
        paymentMethod: 'zelle', // Default to zelle, can be updated at pickup
        orderType: 'pickup',
        estimatedCompletionTime: data.inStockPickupDate ? new Date(data.inStockPickupDate) : undefined
      });

      // Create pickup message
      const pickupMessage = [
        data.inStockPickupDate && data.inStockPickupTime && 
          `We'll see you on ${format(data.inStockPickupDate, 'MMMM d, yyyy')} at ${data.inStockPickupTime} for in-stock items`,
        data.madeToOrderPickupDate && data.madeToOrderPickupTime && 
          `on ${format(data.madeToOrderPickupDate, 'MMMM d, yyyy')} at ${data.madeToOrderPickupTime} for made-to-order items`
      ].filter(Boolean).join(' and ');

      toast({
        title: "Order received!",
        description: `Thank you for your order. ${pickupMessage}. Please check your email for payment instructions.`,
      });

      // Reset form and cart
      form.reset(defaultValues);
      setCart([]);

    } catch (error) {
      console.error('Error submitting order:', error);
      toast({
        title: "Error",
        description: "Failed to submit order. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-4xl md:text-5xl font-serif font-bold text-bakery-brown text-center mb-4">
        Place Your Pre-Order
      </h1>
      <p className="text-xl text-gray-600 text-center max-w-2xl mx-auto mb-12 font-sans">
        Order your freshly baked goods ahead of time for pickup at our location.
      </p>

      {/* Payment Instructions */}
      <PaymentInstructions />

      {/* Order Deadline Notice */}
      <div className="max-w-2xl mx-auto mb-12">
        <div className="bg-bakery-gold/10 border border-bakery-gold/30 rounded-lg p-6 text-center">
          <h2 className="text-xl font-serif font-semibold text-bakery-brown mb-2">
            Important Order Information
          </h2>
          <p className="text-lg text-gray-700 font-sans">
            Orders close Wednesday by 6pm for Saturday pickup.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Menu Selection */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-lg">Select Items</CardTitle>
              <CardDescription className="text-sm font-sans">Browse our menu and add items to your order</CardDescription>
            </CardHeader>
            <CardContent className="p-4">
              {/* Category filter */}
              <div className="mb-4">
                <h3 className="font-serif font-medium text-sm mb-2">Categories</h3>
                <div className="flex flex-wrap gap-1">
                  <Button
                    variant={selectedCategory === 'all' ? 'default' : 'outline'}
                    className={selectedCategory === 'all' ? 'bg-bakery-brown hover:bg-bakery-light font-sans text-sm' : 'border-bakery-brown text-bakery-brown hover:bg-bakery-brown/10 font-sans text-sm'}
                    size="sm"
                    onClick={() => setSelectedCategory('all')}
                  >
                    All
                  </Button>
                  {categories.map(category => (
                    <Button
                      key={category}
                      variant={selectedCategory === category ? 'default' : 'outline'}
                      className={selectedCategory === category ? 'bg-bakery-brown hover:bg-bakery-light font-sans text-sm' : 'border-bakery-brown text-bakery-brown hover:bg-bakery-brown/10 font-sans text-sm'}
                      size="sm"
                      onClick={() => setSelectedCategory(category)}
                    >
                      {category}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Dietary restrictions filter */}
              <div className="mb-4">
                <h3 className="font-serif font-medium text-sm mb-2">Dietary Preferences</h3>
                <ToggleGroup 
                  type="multiple" 
                  variant="outline" 
                  className="flex flex-wrap gap-1"
                  value={selectedDietary} 
                  onValueChange={handleDietaryToggle}
                >
                  {dietaryOptions.map(option => (
                    <ToggleGroupItem 
                      key={option.id} 
                      value={option.id} 
                      aria-label={option.label}
                      className="flex items-center border-bakery-brown text-bakery-brown hover:bg-bakery-brown/10 data-[state=on]:bg-bakery-brown data-[state=on]:text-white font-sans text-sm"
                    >
                      {option.icon}
                      {option.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>

              {/* Menu items */}
              <div className="max-h-[400px] overflow-y-auto">
                {filteredMenuItems.length === 0 ? (
                  <div className="text-center p-8 text-gray-500 font-sans text-lg">
                    No items match your selected filters.
                  </div>
                ) : (
                  categories
                    .filter(category => 
                      selectedCategory === 'all' || category === selectedCategory
                    )
                    .map(category => {
                      const categoryItems = filteredMenuItems.filter(item => item.category === category);
                      if (categoryItems.length === 0) return null;
                      
                      return (
                        <div key={category} className="mb-8">
                          <h3 className="font-serif font-semibold text-lg mb-3">{category}</h3>
                          <div className="space-y-3">
                            {categoryItems.map(item => (
                              <div key={item.id} className="flex justify-between items-center p-3 rounded-md bg-bakery-cream/20 hover:bg-bakery-cream/40 relative">
                                <div className="absolute top-2 right-2 flex gap-2">
                                  {item.isSpecial && (
                                    <Badge className="bg-bakery-gold text-white">
                                      Special
                                    </Badge>
                                  )}
                                  {item.bestSeller && (
                                    <Badge className="bg-bakery-brown text-white">
                                      Best Seller
                                    </Badge>
                                  )}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="font-medium font-sans text-lg">{item.name}</p>
                                  </div>
                                  <div className="flex gap-1 mt-1">
                                    <TooltipProvider>
                                      {item.dietaryInfo.vegan && (
                                        <Tooltip>
                                          <TooltipTrigger>
                                            <Vegan size={16} className="text-green-600" />
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p>Vegan - Contains no animal products</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      )}
                                      {item.dietaryInfo.glutenFree && (
                                        <Tooltip>
                                          <TooltipTrigger>
                                            <WheatOff size={16} className="text-yellow-600" />
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p>Gluten Free - No wheat, rye, or barley</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      )}
                                      {item.dietaryInfo.nutFree && (
                                        <Tooltip>
                                          <TooltipTrigger>
                                            <EggOff size={16} className="text-yellow-600" />
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p>Nut Free - No nuts or nut products</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      )}
                                      {item.dietaryInfo.dairyFree && (
                                        <Tooltip>
                                          <TooltipTrigger>
                                            <MilkOff size={16} className="text-blue-600" />
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p>Dairy Free - No milk or dairy products</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      )}
                                      {item.dietaryInfo.halal && (
                                        <Tooltip>
                                          <TooltipTrigger>
                                            <img src="/images/halalwhite.jpg" alt="Halal" className="w-4 h-4" />
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p>Halal - Prepared according to Islamic dietary laws</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      )}
                                      {item.dietaryInfo.kosher && (
                                        <Tooltip>
                                          <TooltipTrigger>
                                            <Star size={16} className="text-purple-600" />
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p>Kosher - Prepared according to Jewish dietary laws</p>
                                          </TooltipContent>
                                        </Tooltip>
                                      )}
                                    </TooltipProvider>
                                  </div>
                                  {Object.entries(item.allergens).some(([_, value]) => value) && (
                                    <div className="mt-1">
                                      <div className="flex flex-wrap gap-1">
                                        {Object.entries(item.allergens).map(([allergen, present]) => 
                                          present && (
                                            <Badge key={allergen} variant="outline" className="text-red-600 border-red-600 text-xs">
                                              {allergen.replace(/([A-Z])/g, ' $1').trim()}
                                            </Badge>
                                          )
                                        )}
                                      </div>
                                    </div>
                                  )}
                                  <div className="mt-1">
                                    {item.madeToOrder ? (
                                      <Badge variant="outline" className="text-bakery-brown border-bakery-brown text-xs">Made to Order</Badge>
                                    ) : item.stock > 0 ? (
                                      <Badge variant="outline" className="text-green-600 border-green-600 text-xs">{item.stock} in stock</Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-red-600 border-red-600 text-xs">Out of stock</Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mt-1">
                                    <p className="text-base text-gray-600 font-sans">${Number(item.price || 0).toFixed(2)}</p>
                                  </div>
                                </div>
                                <Button 
                                  onClick={() => addToCart(item)}
                                  variant="outline" 
                                  size="sm"
                                  className="border-bakery-brown text-bakery-brown hover:bg-bakery-brown hover:text-white font-sans text-lg"
                                  disabled={!item.madeToOrder && item.stock === 0}
                                >
                                  Add
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Order Form and Cart */}
        <div className="lg:col-span-2">
          <div className="grid gap-8">
            {/* Cart */}
            <Card>
              <CardHeader>
                <CardTitle className="font-serif">Your Order</CardTitle>
                <CardDescription className="text-lg font-sans">Review your selected items</CardDescription>
              </CardHeader>
              <CardContent>
                {cart.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 font-sans text-lg">
                    Your cart is empty. Add items from the menu to get started.
                  </div>
                ) : (
                  <div className="space-y-6">
                    {inStockItems.length > 0 && (
                      <div>
                        <h3 className="font-medium text-lg mb-3 text-bakery-brown">In-Stock Items</h3>
                        <div className="space-y-4">
                          {inStockItems.map(item => (
                            <div key={item.id} className="flex justify-between items-center p-4 rounded-md bg-white border">
                              <div>
                                <p className="font-medium font-sans text-lg">{item.name}</p>
                                <p className="text-base text-gray-600 font-sans">${Number(item.price || 0).toFixed(2)} each</p>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8 rounded-full"
                                  onClick={() => updateQuantity(item.id, item.quantity - 1)}
                                >
                                  <Minus className="h-4 w-4" />
                                </Button>
                                <span className="w-8 text-center font-sans text-lg">{item.quantity}</span>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8 rounded-full"
                                  onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-gray-500 hover:text-red-500"
                                  onClick={() => removeFromCart(item.id)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {madeToOrderItems.length > 0 && (
                      <div>
                        <h3 className="font-medium text-lg mb-3 text-bakery-brown">Made-to-Order Items</h3>
                        <div className="space-y-4">
                          {madeToOrderItems.map(item => (
                            <div key={item.id} className="flex justify-between items-center p-4 rounded-md bg-white border">
                              <div>
                                <p className="font-medium font-sans text-lg">{item.name}</p>
                                <p className="text-base text-gray-600 font-sans">${Number(item.price || 0).toFixed(2)} each</p>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8 rounded-full"
                                  onClick={() => updateQuantity(item.id, item.quantity - 1)}
                                >
                                  <Minus className="h-4 w-4" />
                                </Button>
                                <span className="w-8 text-center font-sans text-lg">{item.quantity}</span>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8 rounded-full"
                                  onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-gray-500 hover:text-red-500"
                                  onClick={() => removeFromCart(item.id)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="border-t pt-4 mt-4">
                      <div className="flex justify-between font-bold text-xl">
                        <span className="font-sans">Total:</span>
                        <span className="font-sans">${Number(cartTotal || 0).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Order Form */}
            <Card>
              <CardHeader>
                <CardTitle className="font-serif">Customer Information</CardTitle>
                <CardDescription>
                  <div className="font-sans text-lg">
                    <p>In-stock items can be picked up Monday-Friday, 9 AM-5 PM.</p>
                    <p>Made to Order items can be ordered before Wednesday 6pm and can be picked up on Saturdays between 9AM-5PM.</p>
                  </div>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form 
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const formData = form.getValues();
                      await onSubmit(formData);
                    }} 
                    className="space-y-6"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="font-sans text-lg">Name <span className="text-red-500">*</span></FormLabel>
                            <FormControl>
                              <Input placeholder="Enter your name" {...field} className="font-sans text-lg" />
                            </FormControl>
                            <FormMessage className="font-sans text-base" />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="font-sans text-lg">Phone <span className="text-red-500">*</span></FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Phone number (xxx-xxx-xxxx)" 
                                {...field} 
                                className="font-sans text-lg"
                                onChange={(e) => {
                                  field.onChange(formatPhoneNumber(e.target.value));
                                }}
                                maxLength={12}
                              />
                            </FormControl>
                            <FormMessage className="font-sans text-base" />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-sans text-lg">Email <span className="text-red-500">*</span></FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="Enter your email" {...field} className="font-sans text-lg" />
                          </FormControl>
                          <FormMessage className="font-sans text-base" />
                        </FormItem>
                      )}
                    />

                    {inStockItems.length > 0 && (
                      <div className="space-y-6 border-t pt-6">
                        <h3 className="font-medium text-lg text-bakery-brown">In-Stock Items Pickup</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <FormField
                            control={form.control}
                            name="inStockPickupDate"
                            render={({ field }) => (
                              <FormItem className="flex flex-col">
                                <FormLabel className="font-sans text-lg">Pickup Date <span className="text-red-500">*</span></FormLabel>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <FormControl>
                                      <Button
                                        variant={"outline"}
                                        className={cn(
                                          "pl-3 text-left font-normal font-sans text-lg",
                                          !field.value && "text-muted-foreground"
                                        )}
                                      >
                                        {field.value ? (
                                          format(field.value, "PPP")
                                        ) : (
                                          <span>Select date</span>
                                        )}
                                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                      </Button>
                                    </FormControl>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                      mode="single"
                                      selected={field.value}
                                      onSelect={field.onChange}
                                      fromDate={(() => {
                                        const now = new Date();
                                        const minDate = new Date(now);
                                        minDate.setDate(now.getDate() + 1); // Next day pickup
                                        return minDate;
                                      })()}
                                      disabled={(date) => {
                                        if (!(date instanceof Date)) return true;
                                        // Disable weekends (Saturday = 6, Sunday = 0)
                                        return date.getDay() === 0 || date.getDay() === 6;
                                      }}
                                      initialFocus
                                    />
                                  </PopoverContent>
                                </Popover>
                                <FormMessage className="font-sans text-base" />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="inStockPickupTime"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="font-sans text-lg">Pickup Time <span className="text-red-500">*</span></FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger className="font-sans text-lg">
                                      <SelectValue placeholder="Select a pickup time" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {PICKUP_TIMES.map((time) => (
                                      <SelectItem key={time} value={time} className="font-sans text-lg">
                                        {time}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage className="font-sans text-base" />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>
                    )}

                    {madeToOrderItems.length > 0 && (
                      <div className="space-y-6 border-t pt-6">
                        <h3 className="font-medium text-lg text-bakery-brown">Made-to-Order Items Pickup</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <FormField
                            control={form.control}
                            name="madeToOrderPickupDate"
                            render={({ field }) => (
                              <FormItem className="flex flex-col">
                                <FormLabel className="font-sans text-lg">Pickup Date <span className="text-red-500">*</span></FormLabel>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <FormControl>
                                      <Button
                                        variant={"outline"}
                                        className={cn(
                                          "pl-3 text-left font-normal font-sans text-lg",
                                          !field.value && "text-muted-foreground"
                                        )}
                                      >
                                        {field.value ? (
                                          format(field.value, "PPP")
                                        ) : (
                                          <span>Select date</span>
                                        )}
                                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                      </Button>
                                    </FormControl>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                      mode="single"
                                      selected={field.value}
                                      onSelect={field.onChange}
                                      fromDate={(() => {
                                        const now = new Date();
                                        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                                        const currentDay = now.getDay();
                                        const daysUntilNextSaturday = (6 - currentDay + 7) % 7;
                                        const upcomingSaturday = new Date(today);
                                        upcomingSaturday.setDate(today.getDate() + daysUntilNextSaturday);
                                        return upcomingSaturday;
                                      })()}
                                      disabled={(date) => {
                                        if (!(date instanceof Date)) return true;
                                        return date.getDay() !== 6; // Only allow Saturdays
                                      }}
                                      initialFocus
                                    />
                                  </PopoverContent>
                                </Popover>
                                <FormMessage className="font-sans text-base" />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="madeToOrderPickupTime"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="font-sans text-lg">Pickup Time <span className="text-red-500">*</span></FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger className="font-sans text-lg">
                                      <SelectValue placeholder="Select a pickup time" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {PICKUP_TIMES.map((time) => (
                                      <SelectItem key={time} value={time} className="font-sans text-lg">
                                        {time}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage className="font-sans text-base" />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>
                    )}

                    <FormField
                      control={form.control}
                      name="specialInstructions"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-sans text-lg">Special Instructions (Optional)</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Any special requests or dietary concerns?" 
                              className="resize-none font-sans text-lg" 
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage className="font-sans text-base" />
                        </FormItem>
                      )}
                    />

                    <Button 
                      type="submit" 
                      className="w-full bg-bakery-brown hover:bg-bakery-light text-white font-sans text-lg"
                      disabled={cart.length === 0 || isSubmitting}
                    >
                      {isSubmitting ? "Processing..." : cart.length === 0 ? "Add items to cart to place order" : "Place Order"}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderPage;
